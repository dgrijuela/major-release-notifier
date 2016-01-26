'use strict';

require('es6-promise').polyfill();
require('isomorphic-fetch');

var sendgrid = require("sendgrid")(process.env.SENDGRID_KEY);
var email = new sendgrid.Email();

const redis = require("redis");
const client = redis.createClient({url: process.env.REDISTOGO_URL});

const versionRegex = /(\d{1,2}\.\d{1,2}\.\d{1,2})/;
const majorVersionRegex = /(\d{1,2})\.\d{1,2}\.\d{1,2}/;
const minorVersionRegex = /\d{1,2}\.(\d{1,2})\.\d{1,2}/;

const dependencies = JSON.parse(process.env.DEPENDENCIES);

client.on("error", function (err) {
  console.log("Error " + err);
});

process.env.PACKAGE_JSON_URLS.split(/[ ,]+/).forEach(packageJsonUrl => {
  fetch(packageJsonUrl)
  .then(response => {
    return response.text();
  })
  .then(text => {
    let parsedText = JSON.parse(text);
    Object.keys(dependencies).forEach(dependency => {
      let dependencyPackageJsonVersion = parsedText.dependencies[dependency].match(versionRegex)[1];
      client.set(dependency, dependencyPackageJsonVersion, redis.print);
      checkLastVersion(dependency, dependencyPackageJsonVersion, packageJsonUrl);
    });
  })
  .catch(error => {
    console.log(error);
  });
})

let checkLastVersion = (dependency, dependencyPackageJsonVersion, packageJsonUrl) => {
  getLastVersion(dependency).then(lastVersion => {
    client.get(dependency, (err, dependencyPackageJsonVersion) => {
      detectMajorVersion(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl);
    })
  });
}

let getLastVersion = (dependency) => {
  return fetch(dependencies[dependency] + '/releases.atom')
  .then(response => {
    return response.text();
  })
  .then(text => {
    let titleTag = text.match(/<title>[\s\S]+?<title>(.+?)<\/title>/)[1];
    return titleTag.match(versionRegex)[1];
  })
  .catch(error => {
    console.log('error: ' + error);
  });
}

let detectMajorVersion = (dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl) => {
  let dependencyPackageJsonVersionMajorVersion = dependencyPackageJsonVersion.match(majorVersionRegex)[1];
  let dependencyPackageJsonVersionMinorVersion = dependencyPackageJsonVersion.match(minorVersionRegex)[1];

  let lastVersionMajorVersion = lastVersion.match(majorVersionRegex)[1];
  let lastVersionMinorVersion = lastVersion.match(minorVersionRegex)[1];

  if (dependencyPackageJsonVersionMajorVersion < lastVersionMajorVersion) {
    client.get(dependency + '-' + lastVersion + '-notification', (err, reply) => {
      if (!reply) {
        notify(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl);
      }
    })
  } else if (dependencyPackageJsonVersionMinorVersion < lastVersionMinorVersion && process.env.MINOR_NOTIFICATIONS == 'true') {
    client.get(dependency + '-' + lastVersion + '-notification', (err, reply) => {
      if (!reply) {
        notify(dependency, dependencyPackageJsonVersion, lastVersion);
      }
    })
  }
}

let notify = (dependency, dependencyPackageJsonVersion, lastVersion) => {
  var email = new sendgrid.Email(generateMessage(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl));

  email.setTos(process.env.EMAILS.split(/[ ,]+/));

  sendgrid.send(email, function(err, json) {
    if (err) { return console.error(err); }
    console.log(json);
    client.set(dependency + '-' + lastVersion + '-notification', lastVersion.match(majorVersionRegex)[1]);
  });
}

let generateMessage = (dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl) => {
  return {
    'html': '<p>I have detected that in the package.json ' + packageJsonUrl + ' the dependency <b>' + dependency + '</b> has the version <b>' + dependencyPackageJsonVersion + '</b> selected and the last one available is the <b>' + lastVersion + '</b>.</p>' + '<p>Go and check out the last changes!: ' + dependencies[dependency] + '.</p>',
    'subject': 'There is a major release available for ' + dependency + ': ' + lastVersion,
    'from': process.env.SENDER_EMAIL,
    'fromname': process.env.SENDER_NAME
  }
}
