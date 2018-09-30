var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;
	// super-constructor
	instance_skel.apply(this, arguments);
	self.togglePlayState = 1;
	self.actions(); // export actions
	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;
};

instance.prototype.init = function() {
	var self = this;
	self.status(self.STATE_OK); // status ok!
	debug = self.debug;
	log = self.log;
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'To enable OSC on MagicQ you need to set the mode, and the transmit and/or receive port numbers in Setup, View Settings, Network. Setting a port to 0 disables transmitting/receiving of OSC.'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			tooltip: 'The IP of the Chamsys console',
			width: 6,
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			width: 4,
			regex: self.REGEX_PORT
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	debug("destory", self.id);;
};


instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {

		'pb':      {
			label:      'Set the playback fader level',
			options: [
				{
					type:     'textinput',
					label:    'Playback fader (1-10)',
					id:       'pbId',
					default:  '1',
					regex:    self.REGEX_NUMBER
				},
				{
					type:     'textinput',
					label:    'Fader value (0-100 %)',
					id:       'pbVal',
					default:  '',
					regex:    self.REGEX_NUMBER
				}
			]
		},

		'pbGo':     {
			label:      'Go on Playback',
			options: [
				{
					type:     'textinput',
					label:    'Playback (1-10)',
					id:       'pbId',
					default:  '1',
					regex:    self.REGEX_NUMBER
				}
			]
		},

		'pbFlash':     {
			label:     'Flash Playback',
			options: [
				{
					type:    'textinput',
					label:   'Playback (1-10)',
					id:      'pbId',
					default: '1',
					regex: self.REGEX_NUMBER
				},
				{
					type:    'dropdown',
					label:   'On / Off',
					id:      'pbFId',
					choices: [ { id: '1', label: 'Flash On' }, { id: '0', label: 'Flash Off' } ]
				}
			]
		},

		'pbPause':     {
			label:     'Pause Playback',
			options: [
				{
					type:    'textinput',
					label:   'Playback (1-10)',
					id:      'pbId',
					default: '1',
					regex: self.REGEX_NUMBER
				}
			]
		},

		'pbRelease':     {
			label:     'Release Playback',
			options: [
				{
					type:    'textinput',
					label:   'Playback (1-10)',
					id:      'pbId',
					default: '1',
					regex:   self.REGEX_NUMBER
				}
			]
		},

		'pbJump':     {
			label:     'Playback Jump to Cue',
			options: [
				{
					type:    'textinput',
					label:   'Playback (1-10)',
					id:      'pbId',
					default: '1',
					regex:   self.REGEX_NUMBER
				},
				{
					type:    'textinput',
					label:   'Cue Nr',
					id:      'cue',
					default: '1',
					regex:   self.REGEX_NUMBER
				}
			]
		},
		'execute':     {
			label:     'Execute',
			options: [
				{
					type:    'textinput',
					label:   'Execute Page',
					id:      'exeP',
					default: '1',
					regex:   self.REGEX_NUMBER
				},
				{
					type:    'textinput',
					label:   'Execute Nr',
					id:      'exeNr',
					default: '1',
					regex:   self.REGEX_NUMBER
				},
				{
					type:    'textinput',
					label:   'Execute Level: 0 = Release, 1 = Activate, 2-100 = Encoder Level',
					id:      'exeVal',
					default: '1',
					regex:   self.REGEX_NUMBER
				}
			]
		},

		'dbo':     {
			label:     'Desk Black Out DBO',
			options: [
				{
					type:    'dropdown',
					label:   'On / Off',
					id:      'dboId',
					choices: [ { id: '0', label: 'DBO Off' }, { id: '1', label: 'DBO On' } ]
				}
			]
		}
	});
}

instance.prototype.action = function(action) {
	var self = this;
	var cmd
	var opt = action.options


	switch (action.action){

		case 'pb':
			var arg = {
				type: "i",
				value: opt.pbVal
			};
			cmd = '/pb/'+ opt.pbId;
			debug(cmd,arg);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, [arg]);
		break;

		case 'pbGo':
			cmd = '/pb/' + opt.pbId + '/go';
			debug(cmd);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd,[]);
		break;

		case 'pbFlash':
			var arg = {
				type: "i",
				value: opt.pbFId
			};
			cmd = '/pb/' + opt.pbId + '/flash';
			debug(cmd,arg);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, [arg]);
		break;

		case 'pbPause':
			cmd = '/pb/' + opt.pbId + '/pause';
			debug(cmd);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, []);
		break;

		case 'pbRelease':
			cmd = '/pb/' + opt.pbId + '/release';
			debug(cmd);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, []);
		break;

		case 'dbo':
			var arg = {
				type: "i",
				value: opt.dboId
			};
			cmd = '/dbo';
			debug(cmd,arg)
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, [arg]);
		break;

		case 'pbJump':
			cmd = '/pb/' + opt.pbId + '/' + opt.cue;
			debug(cmd);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, []);

		break;

		case 'execute':
			var arg = {
				type: "i",
				value: parseInt(opt.exeVal)
			};
			cmd = '/exec/' + opt.exeP + '/' + opt.exeNr;
			debug(cmd,arg);
			self.system.emit('osc_send', self.config.host, self.config.port, cmd, [arg]);

		break;

	}

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
