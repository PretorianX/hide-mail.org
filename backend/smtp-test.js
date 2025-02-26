const nodemailer = require('nodemailer');

// Create a test account
async function main() {
  // SMTP server configuration
  const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 2525,
    secure: false,
    ignoreTLS: true,
    logger: true,
    debug: true
  });

  // Email content
  const mailOptions = {
    from: 'test@example.com',
    to: 'test@mailduck.io', // Replace with an active mailbox
    subject: 'Test Email',
    text: 'This is a test email from the SMTP test script.',
    html: '<p>This is a test email from the SMTP test script.</p>'
  };

  try {
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

main().catch(console.error); 