const Joi = require('joi');

const validateRegister = (data) => {
  const schema = Joi.object({
    fullName: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('customer', 'driver').optional()
  });

  return schema.validate(data);
};

const validateLogin = (data) => {
  const schema = Joi.object({
    emailOrPhone: Joi.string().required(),
    password: Joi.string().required()
  });

  return schema.validate(data);
};

module.exports = {
  validateRegister,
  validateLogin
};