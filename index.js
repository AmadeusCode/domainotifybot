const config = require('./config.json');
const whoisRaw = require('whois');
const whoisJson = require('whois-to-json');
const CronJob = require('cron').CronJob;
// Telegram
const { Telegraf } = require('telegraf');
const bot = new Telegraf(config.token);
// Database
const { Types } = require('mongoose');
const mongodb = require('./mongodb');
const Users = require('./models/Users');
const Domains = require('./models/Domains');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}
async function asyncReducePush(array, func) {
    var val = [];
    for (let index = 0; index < array.length; index++) {
        val.push(await func(array[index]));
    }
    return val;
}

// Helper functions
async function parseDomainData(domainData) {
    var saveData = {
        updatedDate: Date.now()
    };
    await asyncForEach(Object.keys(domainData), async (key) => {
        const value = domainData[key];
        if (/.*(created|creation|creation).*/gi.test(key)) {
            if (!isNaN(Date.parse(value))) {
                saveData.creationDate = Date.parse(value);
            }
        } else if (/.*(expir|paid|till|registry|expiry).*/gi.test(key)) {
            if (!isNaN(Date.parse(value))) {
                saveData.expiryDate = Date.parse(value);
            }
        } else if (/.*state.*/gi.test(key)) {
            saveData.state = value;
        } else if (/.*(contact+phone).*/gi.test(key)) {
            saveData.contactPhone = value;
        } else if (/.*(contact+email).*/gi.test(key)) {
            saveData.contactEmail = value;
        } else if (/.*(registrar).*/gi.test(key)) {
            saveData.domainRegistrar = value;
        }
    });
    return saveData;
}
async function getDomainInfo(domain) {
    return await new Promise(async (resolve, reject) => {
        whoisJson(domain)
            .then(async (response) => {
                resolve(await parseDomainData(response));
            })
            .catch((e) => reject(e));
    });
}
async function getDomainsInfo(domains) {
    var info = [];
    await asyncForEach(domains, async (domain) => {
        await getDomainInfo(domain)
            .then((saveData) => {
                saveData.domain = domain;
                info.push(saveData);
            })
            .catch((e) => console.log(e));
    });
    return info;
}
async function parseDomains(message) {
    var urls = [];
    await asyncForEach(message.entities, (entity) => {
        if (entity.type === 'url')
            urls.push(
                message.text.slice(entity.offset, entity.offset + entity.length)
            );
    });
    return urls;
}
function diffInDays(date) {
    return Math.ceil((date - Date.now()) / (1000 * 3600 * 24));
}

// Scheduled Launch
async function notify() {
    new CronJob('00 00 12 * * *', async function () {
        // every day at 12 A.M
        const domains = await Domains.find({}, { expiryDate: 1, domain: 1 })
            .sort({ expiryDate: -1 })
            .limit(1000);
        await asyncForEach(domains, async (domain) => {
            const diffDays = diffInDays(domain.expiryDate) + 28;
            if (diffDays == 30 || diffDays < 5) {
                const usersTrackingDomain = await Users.find(
                    { followDomains: { $in: Types.ObjectId(domain._id) } },
                    { _id: 0 }
                );
                await asyncForEach(usersTrackingDomain, async (user) => {
                    bot.telegram.sendMessage(
                        user.chatId,
                        `domain ${domain.domain} is expire in ${diffDays} days`
                    );
                });
            }
        });
    }).start();
}
async function update() {
    new CronJob('00 00 00 * * *', async function () {
        const ifLowerThen = 90 * 24 * 60 * 60 * 1000; // If Expires in next 90 days
        const checkDate = new Date(
            new Date().getTime() + ifLowerThen
        ).toISOString();
        const domains = await Domains.find({
            expiryDate: {
                $lte: checkDate
            }
        });
        var promises = [];
        asyncForEach(domains, (domain) => {
            promises.push(
                new Promise(async (resolve, reject) => {
                    await getDomainInfo(domain.domain)
                        .then(async (domainData) => {
                            await Domains.findOneAndUpdate(
                                { domain: domain.domain },
                                domainData
                            );
                            console.log(`${domain.domain} updated!`);
                            resolve();
                        })
                        .catch((e) =>
                            console.log(
                                `Cannot get info about ${domain.domain}. Error ${e}`
                            )
                        );
                })
            );
        }).then(async () => {
            await Promise.all(promises).then(() => {
                console.log(`Update info about last expire domains`);
            });
        });
    }).start();
}

// Telegram Bot Commands
bot.command('info', async (ctx) => {
    const urls = await parseDomains(ctx.update.message);
    if (urls.length > 0) {
        whoisRaw.lookup(urls[0], function (err, data) {
            if (err) console.log(err);
            ctx.reply(data);
        });
    } else {
        ctx.reply('Not found domain. Please write domain like google.com');
    }
});

bot.command('watch', async (ctx) => {
    const domains = await parseDomains(ctx.update.message);
    if (domains.length > 0) {
        const chatId = ctx.update.message.chat.id;
        const user = await Users.findOne({ chatId: chatId });
        await getDomainsInfo(domains)
            .then(async (domainsInfo) => {
                var ids = [];
                await asyncForEach(domainsInfo, async (domainInfo) => {
                    domain = await Domains.findOne({
                        domain: domainInfo.domain
                    });
                    if (domain == null) {
                        let insertData = await new Domains(domainInfo).save();
                        ids.push(insertData._id);
                    } else {
                        ids.push(domain._id);
                    }
                });
                if (user == null) {
                    const userInfo = ctx.update.message.from;
                    const data = {
                        username: userInfo.username,
                        chatId: userInfo.id,
                        firstName: userInfo.first_name,
                        lastName: userInfo.last_name,
                        languageCode: userInfo.language_code,
                        followDomains: ids
                    };
                    new Users(data).save();
                } else {
                    await Users.updateOne({ $push: { followDomains: ids } });
                }
                ctx.reply(
                    `Done! You are subscribed on: ${domains.join(' ')} domain${
                        domains.length > 1 ? 's' : ''
                    }`
                );
            })
            .catch((e) => console.log(e));
    } else {
        ctx.reply(
            'Not found domain. Please write domain like "/watch google.com"'
        );
    }
});

bot.command('tracking', async (ctx) => {
    const chatId = ctx.update.message.chat.id;
    const user = await Users.findOne({ chatId: chatId });
    if (user == null) {
        ctx.reply(
            'You don\'t have any domains. Please add someone with "/watch anydomain1.com anydomain2.com ..." command.'
        );
    } else {
        const domains = await asyncReducePush(
            user.followDomains,
            async (elem) => {
                return await new Promise(async (resolve) => {
                    const data = await Domains.findById(elem, {
                        domain: 1,
                        expiryDate: 1,
                        _id: 0
                    });
                    resolve(data);
                });
            }
        );
        domains.sort(function (a, b) {
            return a.expiryDate - b.expiryDate;
        });
        const respDomains = await asyncReducePush(domains, async (domain) => {
            return await new Promise(async (resolve) => {
                const expire = Math.ceil(
                    (domain.expiryDate - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const freeDate =
                    Math.ceil(
                        (domain.expiryDate - Date.now()) / (1000 * 60 * 60 * 24)
                    ) + 28;
                resolve(`${domain.domain} | ${expire} days | ${freeDate} days`);
            });
        });
        ctx.reply(
            `You tracked ${
                domains.length
            } domains\nDomain | Expire | Free\n${respDomains.join('\n')}`
        );
    }
});

mongodb.then(async () => {
    bot.launch();
    update();
    notify();
});
