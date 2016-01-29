'use strict';

require('es6-promise').polyfill();
require('isomorphic-fetch');

var sendgrid = require("sendgrid")(process.env.SENDGRID_KEY);
var email = new sendgrid.Email();

const redis = require("redis");
const client = redis.createClient({url: process.env.REDISTOGO_URL});

const npmUrl = 'https://www.npmjs.com/package/';

const versionRegex = /(\d{1,2}\.\d{1,2}\.\d{1,2})/;
const npmVersionRegex = /(\d{1,2}\.\d{1,2}\.\d{1,2}).*\<\/strong\>\s+is the latest/;
const majorVersionRegex = /(\d{1,2})\.\d{1,2}\.\d{1,2}/;
const minorVersionRegex = /\d{1,2}\.(\d{1,2})\.\d{1,2}/;

const approvedDependencies = process.env.DEPENDENCIES && process.env.DEPENDENCIES.split(/[ ,]+/);
const packageJsonUrls = process.env.PACKAGE_JSON_URLS.split(/[ ,]+/);

client.on("error", function (err) {
  console.error("Error " + err);
});

packageJsonUrls.forEach(packageJsonUrl => {
  fetch(packageJsonUrl)
  .then(response => {
    return response.text();
  })
  .then(text => {
    let parsedText = JSON.parse(text);
    let dependencies = parsedText.dependencies;
    let devDependencies = parsedText.devDependencies;
    let allDependencies = Object.assign(dependencies, devDependencies);

    let allDependenciesArray = Object.keys(allDependencies).filter(dependency => {
      if (approvedDependencies) {
        return contains(approvedDependencies, dependency);
      } else {
        return true
      }
    });

    allDependenciesArray.forEach(dependency => {
      let dependencyPackageJsonVersion = allDependencies[dependency].match(versionRegex)[1];
      client.set(dependency, dependencyPackageJsonVersion);
      getLastVersion(dependency).then(lastVersion => {
        client.get(dependency, (err, dependencyPackageJsonVersion) => {
          if (err) console.error('error setting the package json version');
          detectMajorVersion(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl);
        })
      });
    });
  })
  .catch(error => {
    console.error(error);
  });
})

let getLastVersion = (dependency) => {
  return fetch(npmUrl + dependency)
  .then(response => {
    return response.text();
  })
  .then(text => {
    return text.match(npmVersionRegex)[1];
  })
  .catch(error => {
    console.error('error: ' + error);
  });
}

let detectMajorVersion = (dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl) => {
  let dependencyPackageJsonVersionMajorVersion = dependencyPackageJsonVersion.match(majorVersionRegex)[1];
  let dependencyPackageJsonVersionMinorVersion = dependencyPackageJsonVersion.match(minorVersionRegex)[1];

  let lastVersionMajorVersion = lastVersion.match(majorVersionRegex)[1];
  let lastVersionMinorVersion = lastVersion.match(minorVersionRegex)[1];

  if (dependencyPackageJsonVersionMajorVersion < lastVersionMajorVersion) {
    client.get(dependency + '-' + lastVersion + '-notification', (err, reply) => {
      if (err) console.error('error getting dependency version notification (for major)');
      if (!reply) {
        notify(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl);
      }
    })
  } else if (dependencyPackageJsonVersionMinorVersion < lastVersionMinorVersion && process.env.MINOR_NOTIFICATIONS == 'true') {
    client.get(dependency + '-' + lastVersion + '-notification', (err, reply) => {
      if (err) console.error('error getting dependency version notification (for minor)');
      if (!reply) {
        notify(dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl);
      }
    })
  }
}

let notify = (dependency, dependencyPackageJsonVersion, lastVersion, packageJsonUrl) => {
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
    'html': '<p>I have detected that in the package.json ' + packageJsonUrl + ' the dependency <b>' + dependency + '</b> has the version <b>' + dependencyPackageJsonVersion + '</b> selected and the last one available is the <b>' + lastVersion + '</b>.</p>' + '<p>Go and check out the last changes!: ' + npmUrl + dependency + '.</p>',
    'subject': 'There is a release update available for ' + dependency + ': ' + lastVersion,
    'from': process.env.SENDER_EMAIL,
    'fromname': process.env.SENDER_NAME
  }
}

function contains(a, obj) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] === obj) {
      return true;
    }
  }
  return false;
}
