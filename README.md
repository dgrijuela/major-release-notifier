These are the environment variables needed:

- **PACKAGE_JSON_URLS**: comma separated list of github urls to the raw content of the desired package.jsons
- **REDISTOGO_URL**: automatically generated by Heroku with the redistogo addon
- **EMAILS**: comma separated list of emails to send the notification to
- **MINOR_DEPENDENCIES**: comma separated list of packages you want to receive also notifications for minor releases
- **SENDGRID_KEY**: see credentials in settings -> reveal config vars, and generate api key from sendgrid page
- **SENDER_EMAIL**: Email direction that sends you the email (should have a domain whitelisted in Sendgrid)
- **SENDER_NAME**: Name of the email above

Add-ons needed:

- redistogo
- scheduler:standard (command: node index.js)
- sendgrid

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
