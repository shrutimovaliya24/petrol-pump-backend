// Validation utility functions

export const validateEmail = (email) => {
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

export const validateRole = (role) => {
  const validRoles = ['user', 'admin', 'supervisor', 'employer'];
  return validRoles.includes(role);
};

export const validateObjectId = async (id) => {
  const mongoose = (await import('mongoose')).default;
  return mongoose.Types.ObjectId.isValid(id);
};

export const validateRequired = (data, fields) => {
  const missing = [];
  fields.forEach(field => {
    if (!data[field]) {
      missing.push(field);
    }
  });
  return {
    isValid: missing.length === 0,
    missing,
  };
};

