const Discord = require('discord.js');
const logger = require('winston');
const auth = require('./auth.json');
const self = require('./package.json');
const config = require('./config.json');
const reddit = require('./reddit.json');
const fs = require('fs');
const https = require('https');
const qs = require('querystring');

const settingsRaw = fs.readFileSync('settings.json');
const settings = JSON.parse(settingsRaw);

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
	colorize: true,
});
logger.level = config.logger.level;

// Initialize Discord Bot
const bot = new Discord.Client();

bot.once('ready', function(evt) {
	logger.info('Connected');
	logger.info('Logged in as: ' + bot.username + ' - (' + bot.id + ')');
	logger.debug(evt);
});

bot.login(auth.token);

bot.on('message', message => {
	// Our bot needs to know if it will execute a command
	// It will listen for messages that will start with `!`
	logger.info('user: ' + message.author + '; channel: ' + message.channel + ';');
	logger.debug(message);
	if (message.content.substring(0, 1) == config.prefix) {
		let args = message.content.substring(1).split(' ');
		const cmd = args[0];
		args = args.splice(1);
		switch (cmd.toLowerCase()) {
		// !ping
		case 'ping':
			message.channel.send('Pong!');
			break;
			// introduction
		case 'whoru':
		case 'whoareyou':
			message.channel.send('I am here ' + self.description + '!');
			break;
			// register channel
		case 'memehere' :
			setMemeChannel(message.channel);
			message.channel.send('Will send future memes to channel: ' + message.channel.name);
			break;
		case 'memewhere' :
			message.channel.send('Currently sending memes to channel: ' + settings.channel.name);
			break;
		case 'memenow' :
			redditOauth();
			break;
		}
	}
});

function setMemeChannel(channel) {
	settings.channel = channel;
	fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2), function(err) {
		if (err) {return logger.error(err);}
	});
}

function redditOauth() {
	const data = qs.stringify({
		grant_type: 'password',
		username: reddit.username,
		password: reddit.password,
	});

	const options = {
		hostname: 'www.reddit.com',
		path: '/api/v1/access_token',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Authorization': 'Basic ZXdveEYtRHBBUGtSb0E6ZkFXT0JvQXlfN0piTkJLVXltb3JZQXptcmkwczBB',
		},
	};

	const req = https.request(options, res => {
		logger.info(`statusCode: ${res.statusCode}`);

		const chunks = [];

		res.on('data', function(chunk) {
			chunks.push(chunk);
		});

		res.on('end', function() {
			const body = Buffer.concat(chunks);
			logger.debug(body.toString());
			reddit.token = JSON.parse(body.toString());
			logger.debug(reddit.token);
			fs.writeFileSync('reddit.json', JSON.stringify(reddit, null, 2), function(err) {
				if (err) {return logger.error(err);}
			});
			getMemes();
		});

		res.on('error', function(error) {
			logger.error(error);
		});
	});

	req.write(data);

	req.end();
}

function getMemes() {
	const options = {
		hostname: 'oauth.reddit.com',
		path: 'user/' + reddit.username + '/upvoted',
		method: 'GET',
		headers: {
			'User-Agent': self.name + '/' + self.version + ' by ' + reddit.username,
			'Authorization': 'bearer ' + reddit.token.access_token,
		},
	};

	const req = https.request(options, res => {
		logger.info(`statusCode: ${res.statusCode}`);

		const chunks = [];

		res.on('data', function(chunk) {
			chunks.push(chunk);
		});

		res.on('end', function() {
			const body = Buffer.concat(chunks);
			const memes = JSON.parse(body.toString());
			logger.debug();
			fs.writeFileSync('memes.json', JSON.stringify(memes, null, 2), function(err) {
				if (err) {return logger.error(err);}
			});
			sendMemes();
		});

		res.on('error', function(error) {
			logger.error(error);
		});
	});

	req.end();
}

function sendMemes() {
	const memes = require('./memes.json');
	bot.channels.fetch(settings.channel.id).then(x => {
		memes.data.children.forEach(meme => {
			x.send(meme.data.url);
		});
	});
}