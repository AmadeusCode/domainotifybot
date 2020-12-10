const { Schema, model, Types } = require('mongoose');

const schema = new Schema({
	domain: {
		type: String,
		required: true,
		unique: true,
		trim: true,
	},
	updatedDate: {
		type: Date,
		required: true,
	},
	creationDate: {
		type: Date,
		required: true,
	},
	expiryDate: {
		type: Date,
		required: true,
	},
	contactPhone: {
		type: Array,
		required: false,
	},
	state: {
		type: String,
		required: false,
	},
	addedAt: {
		type: Date,
		required: false,
		default: Date.now(),
	},
});

module.exports = model('domains', schema);
