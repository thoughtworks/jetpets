# Jetpets

> Modern *pong* remake, using your mobile phone as the controller.

> Demoed at the ThoughtWorks booth at Agile Australia 2013.

Tech stack: HTML5 / Node.js / Socket.io / Pixi.js / Box2D / Grunt

![screenshot](https://raw.github.com/thoughtworks/jetpets/master/screenshot.jpg)

Or see it in action here: http://www.youtube.com/watch?v=GSAISCejU9s

## Local setup

Install Node.js version `0.10.x` ([homebrew](http://mxcl.github.io/homebrew/) is recommended for OSX), then run

```
npm install -g grunt-cli
npm install
```

We use [grunt](http://gruntjs.com) for building

```
grunt		# builds all assets into ./build and watches for changes
grunt test  # runs the unit tests
```

Players are stored in a JSON file on S3, so you will need to include an aws.json file with S3 credentials in the root of the project. (ThoughtWorkers - there is one you can use on the jetpets myTW page).

And finally

```
npm start
```

This starts the server, and restarts it

- if something goes wrong
- when any server-side code changes

## Playing the game

With the server running, open:


* [localhost:8080/game](http://localhost:8080/game) to start the game runtime
* [localhost:8080/admin](http://localhost:8080/admin) for administrating players
* [your-ip-address:8080](http://10.0.0.1:8080/device) on your phone to join the game!

## Deploying to an external server (ex: Raspberry PI)

The game needs to be built locally first, and the server will just:

- run the server code (`/src`)
- serve static assets & files (`/builtAssets`)

Just run `make deploy [HOST=<IP address>]` to build & copy all the required files over SSH.

The server will need to run `npm install --production` to get all the runtime dependencies.

## Deploying to Heroku

You'll need to have the Heroku Toolbelt installed and a Heroku account. (ThoughtWorkers - see the myTW jetpets page for Heroku credentials)

If you need to create a new Heroku app for jetpets, use 'grunt app:&lt;new-app-name&gt;'; if there is already an app, add it as a git remote ('git remote add heroku git@heroku.com:&lt;existing-app-name&gt;'). Once the app is set up, be sure to generate the build assets first ('grunt build'), before deploying ('git push heroku master').

## Attribution

Thanks to http://www.freesfx.co.uk for the free sound effects
