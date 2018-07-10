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
			value: 'This module is for controlling Chamsys MagicQ consoles'
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

instance.prototype.fader_val = [
	{ label: '- ∞',        id: '0.0' },
	{ label: '-50 dB: ',   id: '0.1251' },
	{ label: '-30 dB',     id: '0.251' },
	{ label: '-20 dB',     id: '0.375' },
	{ label: '-18 dB',     id: '0.4' },
	{ label: '-15 dB',     id: '0.437' },
	{ label: '-12 dB',     id: '0.475' },
	{ label: '-9 dB',      id: '0.525' },
	{ label: '-6 dB',      id: '0.6' },
	{ label: '-3 dB',      id: '0.675' },
	{ label: '-2 dB',      id: '0.7' },
	{ label: '-1 dB',      id: '0.725' },
	{ label: '0 dB',       id: '0.75' },
	{ label: '+1 dB',      id: '0.775' },
	{ label: '+2 dB',      id: '0.8' },
	{ label: '+3 dB',      id: '0.825' },
	{ label: '+4 dB',      id: '0.85' },
	{ label: '+5 dB',      id: '0.875' },
	{ label: '+6 dB',      id: '0.9' },
	{ label: '+9 dB',      id: '0.975' },
	{ label: '+10 dB',     id: '1.0' }
];

instance.prototype.color_val = [
	{ label: 'Off',              id: '0' },
	{ label: 'Red: ',            id: '1' },
	{ label: 'Green',            id: '2' },
	{ label: 'Yellow',           id: '3' },
	{ label: 'Blue',             id: '4' },
	{ label: 'Magenta',          id: '5' },
	{ label: 'Cyan',             id: '6' },
	{ label: 'White',            id: '7' },
	{ label: 'Off Inverted',     id: '8' },
	{ label: 'Red Inverted',     id: '9' },
	{ label: 'Green Inverted',   id: '10' },
	{ label: 'Yellow Inverted',  id: '11' },
	{ label: 'Blue Inverted',    id: '12' },
	{ label: 'Magenta Inverted', id: '13' },
	{ label: 'Cyan Inverted',    id: '14' },
	{ label: 'White Inverted',   id: '15' }
];

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {

		'pb':     {
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
					label:    'Fader value (0-100)',
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

		'pbflash':     {
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
				}
				{
					type:    'textinput',
					label:   'Cue Nr',
					id:      'cue',
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
					choices: [ { id: '1', label: 'DBO Off' }, { id: '0', label: 'DBO On' } ]
				}
			]
		},
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
			self.system.emit('osc_send', self.config.host, self.config.port,'/pb/'+ opt.pbId  , [arg]);
		break;

		case 'pbGo':
			self.system.emit('osc_send', self.config.host, self.config.port,'/pb/' + opt.pbId + '/go' ,[]);
		break;

		case 'pbFlash':
			var arg = {
				type: "i",
				value: opt.pbFId
			};
			self.system.emit('osc_send', self.config.host, self.config.port,'/pb/' + opt.pbId + '/flash' ,[arg]);
		break;

		case 'pbPause':
			self.system.emit('osc_send', self.config.host, self.config.port,'/pb/' + opt.pbId + '/pause' ,[]);
		break;

		case 'pbRelease':
			self.system.emit('osc_send', self.config.host, self.config.port,'/pb/' + opt.pbId + '/release' ,[]);
		break;

		case 'dbo':
			var arg = {
				type: "i",
				value: opt.dboId
			};
			self.system.emit('osc_send', self.config.host, self.config.port,'/dbo'  ,[arg]);
		break;

		case 'pbJump':
		self.system.emit('osc_send', self.config.host, self.config.port,'/pb' + opt.pbId + '/' + opt.cue ,[]);

		break;

}

};

instance.module_info = {
	label: 'Chamsys MagicQ',
	id: 'chamsys',
	version: '0.0.1'
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
