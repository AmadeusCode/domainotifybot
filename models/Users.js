const { Schema, model, Types } = require('mongoose');

const schema = new Schema({
	username: {
		type: String,
		required: true,
		unique: true,
		trim: true,
	},
	chatId: {
		type: Number,
		required: true,
		unique: true,
		trim: true,
	},
	followDomains: {
		type: Array,
		default: false,
	},
	// followDomainZones: {
	// 	type: Array,
	// 	required: true,
	// },
	firstName: {
		type: String,
		required: true,
	},
	lastName: {
		type: String,
		required: true,
	},
	languageCode: {
		type: String,
		required: true,
	},
	joinAt: {
		type: Date,
		required: false,
		default: Date.now(),
	},
});

module.exports = model('users', schema);
