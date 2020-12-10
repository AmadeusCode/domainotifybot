const mongoose = require('mongoose');
const config = require('./config.json');

async function connect() {
	return await mongoose
		.connect(config.mongoAdress, {
			useNewUrlParser: true,
			useFindAndModify: false,
			useUnifiedTopology: true,
			useCreateIndex: true,
		})
		.then(() => {
			console.log('Successfully connect to MongoDB.');
		})
		.catch((err) => {
			console.error('Connection error', err);
			process.exit();
		});
}

module.exports = connect();
