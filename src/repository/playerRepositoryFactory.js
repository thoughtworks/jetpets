'use strict';


// The repository to store and load player data can be either in the
// local filesystem or in AWS. Have a look at the config files in /config/*.yaml
// for the configuration for your environment.
exports.getInstance = function (configuration) {
  var config = configuration || require('config').repository.players;
  var repositoryLocation = config.location;
  var fileLocation = config.file;

  switch (repositoryLocation) {
    case 'aws':
      console.log('Using AWS as player data storage location (%s)', fileLocation);
      return require('./aws');
    case 'filesystem':
      console.log('Using local file system as player data storage location (%s)', fileLocation);
      return require('./filesystem');
    default:
      console.error('Player repository could not be initialised. ' +
        'Use either \'aws\' or \'fs\' as parameters when requiring repository.js');
      return undefined;
  }
};
