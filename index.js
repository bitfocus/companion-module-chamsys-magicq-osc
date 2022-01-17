var instance_skel = require('../../instance_skel')
var debug
var log

function instance(system, id, config) {
	var self = this
	// super-constructor
	instance_skel.apply(this, arguments)
	self.togglePlayState = 1
	self.actions() // export actions
	return self
}

instance.prototype.updateConfig = function (config) {
	var self = this

	self.config = config
}

instance.prototype.init = function () {
	var self = this
	self.status(self.STATE_OK) // status ok!
	debug = self.debug
	log = self.log
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'To enable OSC on MagicQ you need to set the mode, and the transmit and/or receive port numbers in Setup, View Settings, Network. Setting a port to 0 disables transmitting/receiving of OSC.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			tooltip: 'The IP of the Chamsys console',
			width: 6,
			regex: self.REGEX_IP,
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			width: 4,
			regex: self.REGEX_PORT,
		},
	]
}

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this
	debug('destory', self.id)
}

instance.prototype.actions = function (system) {
	var self = this
	self.setActions({
		pb: {
			label: 'Set the playback fader level',
			options: [
				{
					type: 'textinput',
					label: 'Playback fader (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Fader value (0-100 %)',
					id: 'pbVal',
					default: '',
					regex: self.REGEX_NUMBER,
				},
			],
		},

		pbGo: {
			label: 'Go on Playback',
			options: [
				{
					type: 'textinput',
					label: 'Playback (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
			],
		},

		pbFlash: {
			label: 'Flash Playback',
			options: [
				{
					type: 'textinput',
					label: 'Playback (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'dropdown',
					label: 'On / Off',
					id: 'pbFId',
					choices: [
						{ id: '1', label: 'Flash On' },
						{ id: '0', label: 'Flash Off' },
					],
				},
			],
		},

		pbPause: {
			label: 'Pause Playback',
			options: [
				{
					type: 'textinput',
					label: 'Playback (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
			],
		},

		pbRelease: {
			label: 'Release Playback',
			options: [
				{
					type: 'textinput',
					label: 'Playback (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
			],
		},

		pbJump: {
			label: 'Playback Jump to Cue',
			options: [
				{
					type: 'textinput',
					label: 'Playback (1-10)',
					id: 'pbId',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Cue Nr',
					id: 'cue',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
			],
		},
		execute: {
			label: 'Execute',
			options: [
				{
					type: 'textinput',
					label: 'Execute Page',
					id: 'exeP',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Execute Nr',
					id: 'exeNr',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Execute Level: 0 = Release, 1 = Activate, 2-100 = Encoder Level',
					id: 'exeVal',
					default: '1',
					regex: self.REGEX_NUMBER,
				},
			],
		},

		dbo: {
			label: 'Desk Black Out DBO',
			options: [
				{
					type: 'dropdown',
					label: 'On / Off',
					id: 'dboId',
					choices: [
						{ id: '0', label: 'DBO Off' },
						{ id: '1', label: 'DBO On' },
					],
				},
			],
		},
	})
}

instance.prototype.action = function (action) {
	var self = this
	var cmd
	var arg
	var opt = action.options

	switch (action.action) {
		case 'pb':
			arg = {
				type: 'i',
				value: opt.pbVal,
			}
			cmd = '/pb/' + opt.pbId
			break

		case 'pbGo':
			cmd = '/pb/' + opt.pbId + '/go'
			break

		case 'pbFlash':
			arg = {
				type: 'i',
				value: opt.pbFId,
			}
			cmd = '/pb/' + opt.pbId + '/flash'
			break

		case 'pbPause':
			cmd = '/pb/' + opt.pbId + '/pause'
			break

		case 'pbRelease':
			cmd = '/pb/' + opt.pbId + '/release'
			break

		case 'dbo':
			arg = {
				type: 'i',
				value: opt.dboId,
			}
			cmd = '/dbo'
			break

		case 'pbJump':
			cmd = '/pb/' + opt.pbId + '/' + opt.cue

			break

		case 'execute':
			arg = {
				type: 'i',
				value: parseInt(opt.exeVal),
			}
			cmd = '/exec/' + opt.exeP + '/' + opt.exeNr

			break
	}

	if (self.config.host && self.config.port && self.config.port > 0 && self.config.port < 65536) {
		if (arg) {
			debug(cmd, arg)
			self.oscSend(self.config.host, self.config.port, cmd, [arg])
		} else {
			debug(cmd)
			self.oscSend(self.config.host, self.config.port, cmd)
		}
	} else {
		self.debug('Could not send OSC: host or port not defined')
		self.log('error', 'Could not send OSC: host or port not defined')
	}
}

instance_skel.extendedBy(instance)
exports = module.exports = instance
