'use strict';

// The repository to store and load player data can be either in the
// local filesystem or in AWS. Use "require('repository')('[aws|fs]')"
//  to set up the repository accordingly.
module.exports = function(mode) {
  if ('aws' === mode) {
    return require('./aws');
  }
  else if ('fs' === mode) {
    return require('./filesystem');
  }
  else {
    console.error('Player repository could not be initialised. ' +
      'Use either \'aws\' or \'fs\' as parameters when requiring repository.js');
    return undefined;
  }
};
