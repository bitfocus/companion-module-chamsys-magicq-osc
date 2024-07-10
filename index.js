const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')

class MagicQInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.updateStatus('ok')
		this.updateActions()
	}

	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
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
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				width: 4,
				regex: Regex.PORT,
			},
		]
	}

	updateActions() {
		const sendOSC = (cmd, arg = null) => {
			if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
				if (arg) {
					this.log('debug', cmd + ": " + arg)
					this.oscSend(this.config.host, this.config.port, cmd, [arg])
				} else {
					this.log('debug', cmd)
					this.oscSend(this.config.host, this.config.port, cmd)
				}
			} else {
				this.log('error', 'Could not send OSC: host or port not defined')
			}
		}

		this.setActionDefinitions({
			pb: {
				name: 'Set the playback fader level',
				options: [
					{
						type: 'textinput',
						label: 'Playback fader (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Fader value (0-100 %)',
						id: 'pbVal',
						default: '',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)
					let pbVal = await this.parseVariablesInString(action.options.pbVal)

					var arg = {
						type: 'i',
						value: pbVal,
					}
					sendOSC('/pb/' + pbId, arg)
				},
			},

			pbGo: {
				name: 'Go on Playback',
				options: [
					{
						type: 'textinput',
						label: 'Playback (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)
					sendOSC('/pb/' + pbId + '/go')
				},
			},

			pbFlash: {
				name: 'Flash Playback',
				options: [
					{
						type: 'textinput',
						label: 'Playback (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
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
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)

					var arg = {
						type: 'i',
						value: action.options.pbFId,
					}
					sendOSC('/pb/' + pbId + '/flash', arg)
				},
			},

			pbPause: {
				name: 'Pause Playback',
				options: [
					{
						type: 'textinput',
						label: 'Playback (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)
					sendOSC('/pb/' + pbId + '/pause')
				},
			},

			pbRelease: {
				name: 'Release Playback',
				options: [
					{
						type: 'textinput',
						label: 'Playback (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)
					sendOSC('/pb/' + pbId + '/release')
				},
			},

			pbJump: {
				name: 'Jump to Cue in Playback',
				options: [
					{
						type: 'textinput',
						label: 'Playback (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Cue Number',
						id: 'cue',
						default: '1',
						regex: Regex.FLOAT_OR_INT,
					},
				],
				callback: async (action) => {
					let pbId = await this.parseVariablesInString(action.options.pbId)
					let cue = await this.parseVariablesInString(action.options.cue)
					sendOSC('/pb/' + pbId + '/' + cue)
				},
			},

			execute: {
				name: 'Execute',
				options: [
					{
						type: 'textinput',
						label: 'Execute Page',
						id: 'exeP',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Execute Nr',
						id: 'exeNr',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Execute Level: 0 = Release, 1 = Activate, 2-100 = Encoder Level',
						id: 'exeVal',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					let exeP = await this.parseVariablesInString(action.options.exeP)
					let exeNr = await this.parseVariablesInString(action.options.exeNr)
					let exeVal = await this.parseVariablesInString(action.options.exeVal)
					
					var arg = {
						type: 'i',
						value: parseInt(exeVal),
					}
					sendOSC('/exec/' + exeP + '/' + exeNr, arg)
				},
			},

			dbo: {
				name: 'Desk Black Out DBO',
				options: [
					{
						type: 'dropdown',
						label: 'On / Off',
						id: 'dboId',
						choices: [
							{ id: '1', label: 'Black Out On' },
							{ id: '0', label: 'Black Out Off' },
						],
					},
				],
				callback: (action) => {
					var arg = {
						type: 'i',
						value: action.options.dboId,
					}
					sendOSC('/dbo', arg)
				},
			},
		})
	}
}

runEntrypoint(MagicQInstance, [])
