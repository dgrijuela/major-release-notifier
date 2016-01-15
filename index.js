'use strict';

require('es6-promise').polyfill();
require('isomorphic-fetch');
const mandrill = require('mandrill-api/mandrill');
const mandrill_client = new mandrill.Mandrill(process.env.MANDRILL_KEY);
const redis = require("redis");
const client = redis.createClient({url: process.env.REDISTOGO_URL});

const versionRegex = /(\d{1,2}\.\d{1,2}\.\d{1,2})/;
const majorVersionRegex = /(\d{1,2})/;

const dependencies = JSON.parse(process.env.DEPENDENCIES);

client.on("error", function (err) {
    console.log("Error " + err);
});

fetch(process.env.PACKAGE_JSON_URL)
.then(response => {
  return response.text();
})
.then(text => {
  let parsedText = JSON.parse(text);
  Object.keys(dependencies).forEach(dependency => {
    let dependencyPackageJsonVersion = parsedText.dependencies[dependency].match(versionRegex)[1];
    client.set(dependency, dependencyPackageJsonVersion, redis.print);
    checkLastVersion(dependency, dependencyPackageJsonVersion);
  });
})
.catch(error => {
  console.log(error);
});

let checkLastVersion = (dependency, dependencyPackageJsonVersion) => {
  getLastVersion(dependency).then(lastVersion => {
    client.get(dependency, (err, dependencyPackageJsonVersion) => {
      detectMajorVersion(dependency, dependencyPackageJsonVersion, lastVersion);
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

let detectMajorVersion = (dependency, dependencyPackageJsonVersion, lastVersion) => {
  let dependencyPackageJsonVersionMajorVersion = dependencyPackageJsonVersion.match(majorVersionRegex)[1];
  let lastVersionMajorVersion = lastVersion.match(majorVersionRegex)[1];
  if (dependencyPackageJsonVersionMajorVersion < lastVersionMajorVersion) {
    client.get(dependency + '-notification', (err, reply) => {
      if (!reply) {
        notify(dependency, dependencyPackageJsonVersion, lastVersion);
      }
    })
  }
}

let notify = (dependency, dependencyPackageJsonVersion, lastVersion) => {
  mandrill_client.messages.send({"message": generateMessage(dependency, dependencyPackageJsonVersion, lastVersion)}, function(result) {
    console.log(result);
    client.set(dependency + '-notification', lastVersion.match(majorVersionRegex)[1]);
  }, function(e) {
    console.log('A mandrill error occurred: ' + e.name + ' - ' + e.message);
  });
}

let generateMessage = (dependency, dependencyPackageJsonVersion, lastVersion) => {
  let toField = process.env.EMAILS.split(',').map(email => {
    return {
      'email': email
    }
  });

  return {
    'html': '<p>I have detected that in the package.json ' + process.env.PACKAGE_JSON_URL + ' the dependency <b>' + dependency + '</b> has the version <b>' + dependencyPackageJsonVersion + '</b> selected and the last one available is the <b>' + lastVersion + '</b>.</p>' + '<p>Go and check out the last changes!: ' + dependencies[dependency] + '.</p>',
    'subject': 'There is a major release available for ' + dependency + ': ' + lastVersion,
    'from_email': 'hi@ciruapp.com',
    'from_name': 'Major Release Notifier',
    'to': toField
  }
}
