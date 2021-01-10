const Discord = require('discord.js');
const logger = require('winston');
const auth = require('./auth.json');
const self = require('./package.json');
const config = require('./config.json');
const reddit = require('./reddit.json');
const fs = require('fs');
const https = require('https');
const qs = require('querystring');
const schedule = require('node-schedule');

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

bot.login(auth.token);

bot.on('ready', function(evt) {
	logger.info('Connected');
	logger.debug(evt);
	bot.user.setActivity('!memenow !memehere !memewhere', { type: 'WATCHING' });
});

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
			redditOauth().then(getMemes).then((memes) => sendMemesOnRequest(memes, message.channel.id));
			break;
		}
	}
});

schedule.scheduleJob('0 18 * * *', function() {
	redditOauth().then(getMemes).then(sendMemesOnRequest);
});

function setMemeChannel(channel) {
	settings.channel = channel;
	fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2), function(err) {
		if (err) {return logger.error(err);}
	});
}

const redditOauth = () => {
	return new Promise((callBack, reject) => {
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
				callBack(reddit.token);
			});

			res.on('error', function(error) {
				reject(error);
			});
		});

		req.write(data);

		req.end();
	});
};

const getMemes = (token) => {
	logger.debug('token passed into getMemes: ' + token);
	return new Promise((callBack, reject) => {
		const options = {
			hostname: 'oauth.reddit.com',
			path: 'user/' + reddit.username + '/upvoted',
			method: 'GET',
			headers: {
				'User-Agent': self.name + '/' + self.version + ' by ' + reddit.username,
				'Authorization': 'bearer ' + token.access_token,
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
				callBack(memes);
			});

			res.on('error', function(error) {
				reject(error);
			});
		});

		req.end();
	});
};

const sendMemesOnRequest = (memes, msgChannelId) => {
	bot.channels.fetch(settings.channel.id).then(x => {
		const newMemes = memes.data.children.filter(meme => !settings.sentMemes.find(memeName => memeName === meme.data.name));
		if (newMemes.length === 0) {
			if (msgChannelId) {
				bot.channels.fetch(msgChannelId).then(x => x.send('No new memes right now.'));
			}
			else {
				x.send('No new memes today');
			}
		}
		else {
			newMemes.forEach(meme => {
				x.send(meme.data.url);
				settings.sentMemes.push(meme.data.name);
			});
			fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2), function(err) {
				if (err) {return logger.error(err);}
			});
		}
	});
};