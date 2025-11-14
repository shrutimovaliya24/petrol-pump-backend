// Response utility functions for consistent API responses

export const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
};

export const errorResponse = (res, message = 'Error', statusCode = 400, error = {}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : {},
  });
};

export const serverErrorResponse = (res, message = 'Server error', error = {}) => {
  return res.status(500).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : {},
  });
};

