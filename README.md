# Agile Australia game

## Getting set up

Install Node.js version `0.10.x` ([homebrew](http://mxcl.github.io/homebrew/) is recommended for OSX), then run

```
npm install -g grunt-cli
npm install
```

## Build time!

We use [grunt](http://gruntjs.com).
This builds all assets into `build`, and watches for any changes:

```
grunt
```

To run the unit tests:
```
grunt test
```

## Running the game

```
npm start
```

This also restarts the server

- if something goes wrong
- when any server-side code changes

## Deploying to an external server (ex: Raspberry PI)

Just run `make deploy` to copy all the required files to the server over SSH.
Note: the game needs to be built locally first, since the server will just serve static files.


## Attribution

Thanks to http://www.freesfx.co.uk for the free sound effects
