const { z } = require('zod');

const sendSmsSchema = z.object({
  body: z.object({
    phoneNumber: z.string().min(7),
    message: z.string().min(1).max(640)
  }),
  params: z.object({}),
  query: z.object({})
});

module.exports = { sendSmsSchema };
