const { InstanceBase, Regex, runEntrypoint, InstanceStatus, combineRgb } = require('@companion-module/base')
const osc = require('osc')

class MagicQInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.osc = new osc.UDPPort({})
		this.companionOsc = new osc.UDPPort({})

		// objects for playbacks and executes
		this.playbacks = []
		for (var i = 1; i <= 10; i++) {
			this.playbacks[i] = {
				value: 0,
				flash: 0,
			}
		}
		this.execs = []
		for (var i = 1; i <= 10; i++) {
			this.execs[i] = []
		}
		this.variables = []
	}

	async init(config) {
		this.config = config

		if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
			this.setupOSC()
			this.updateActions()
			this.initVariables()
			this.initFeedbacks()
		}
	}

	async initVariables() {
		for (var i = 1; i <= 10; i++) {
			this.variables.push({
				variableId: 'pb' + i,
				name: 'Playback ' + i + ' Level',
			})
			this.variables.push({
				variableId: 'pb' + i + '_flash',
				name: 'Playback ' + i + ' Flash',
			})
		}

		this.setVariableDefinitions(this.variables)
	}

	async initFeedbacks() {
		this.setFeedbackDefinitions({
			pb: {
				type: 'boolean',
				name: 'Playback Level',
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(255, 0, 0),
				},
				description: 'Feedback based on playback level',
				options: [
					{
						type: 'textinput',
						label: 'Playback fader (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'dropdown',
						label: 'Comparison method',
						id: 'pbComp',
						default: 'equal',
						choices: [
							{ id: 'isActive', label: 'Playback Active' },
							{ id: 'equal', label: 'Equal' },
							{ id: 'notEqual', label: 'Not Equal' },
							{ id: 'greater', label: 'Greater than' },
							{ id: 'greaterEqual', label: 'Greater than or equal' },
							{ id: 'less', label: 'Less than' },
							{ id: 'lessEqual', label: 'Less than or equal' },
						],
					},
					{
						type: 'number',
						label: 'Playback value (0-100)',
						id: 'pbVal',
						default: 0,
						min: 0,
						max: 100,
						range: true,
						step: 1,
						isVisible: (options) => {
							return options.pbComp !== 'isActive'
						},
					},
				],
				callback: (feedback) => {
					var pbId = feedback.options.pbId
					var pbVal = feedback.options.pbVal
					var pbComp = feedback.options.pbComp
					var pbLevel = this.playbacks[pbId].value

					switch (pbComp) {
						case 'isActive':
							return pbLevel > 0
						case 'equal':
							return pbLevel === parseInt(pbVal)
						case 'notEqual':
							return pbLevel !== parseInt(pbVal)
						case 'greater':
							return pbLevel > parseInt(pbVal)
						case 'greaterEqual':
							return pbLevel >= parseInt(pbVal)
						case 'less':
							return pbLevel < parseInt(pbVal)
						case 'lessEqual':
							return pbLevel <= parseInt(pbVal)
					}
				},
			},
			pbFlash: {
				type: 'boolean',
				name: 'Playback Flash',
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(255, 0, 0),
				},
				description: 'Feedback based on playback flash status',
				options: [
					{
						type: 'textinput',
						label: 'Playback fader (1-10)',
						id: 'pbId',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: (feedback) => {
					var pbId = feedback.options.pbId
					return this.playbacks[pbId].flash === 1
				},
			},
			exec: {
				type: 'boolean',
				name: 'Execute Level',
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(255, 0, 0),
				},
				description: 'Feedback based on execute level',
				options: [
					{
						type: 'number',
						label: 'Execute Page',
						id: 'execPage',
						default: 1,
						min: 1,
						max: 10,
					},
					{
						type: 'number',
						label: 'Execute Number',
						id: 'execNumber',
						default: 1,
						min: 1,
					},
					{
						type: 'dropdown',
						label: 'Comparison method',
						id: 'execComp',
						default: 'equal',
						choices: [
							{ id: 'isActive', label: 'Execute Active' },
							{ id: 'equal', label: 'Equal' },
							{ id: 'notEqual', label: 'Not Equal' },
							{ id: 'greater', label: 'Greater than' },
							{ id: 'greaterEqual', label: 'Greater than or equal' },
							{ id: 'less', label: 'Less than' },
							{ id: 'lessEqual', label: 'Less than or equal' },
						],
					},
					{
						type: 'number',
						label: 'Execute value (0-100)',
						id: 'execVal',
						default: 0,
						min: 0,
						max: 100,
						range: true,
						step: 1,
						isVisible: (options) => {
							return options.execComp !== 'isActive'
						},
					},
				],
				callback: (feedback) => {
					var execPage = feedback.options.execPage
					var execNumber = feedback.options.execNumber
					var execVal = feedback.options.execVal
					var execComp = feedback.options.execComp
					var execLevel = this.execs[execPage][execNumber]

					switch (execComp) {
						case 'isActive':
							return execLevel > 0
						case 'equal':
							return execLevel === parseInt(execVal)
						case 'notEqual':
							return execLevel !== parseInt(execVal)
						case 'greater':
							return execLevel > parseInt(execVal)
						case 'greaterEqual':
							return execLevel >= parseInt(execVal)
						case 'less':
							return execLevel < parseInt(execVal)
						case 'lessEqual':
							return execLevel <= parseInt(execVal)
					}
				},
			},
		})
	}

	async checkVariables(msg) {
		const pbRegex = /\/pb\/(\d+)$/ // regex for /pb/<pbId (int)>
		const pbFlashRegex = /\/pb\/(\d+)\/flash$/ // regex for /pb/<pbId (int)>/flash
		const execRegex = /\/exec\/(\d+)\/(\d+)$/ // regex for /exec/<exeP (int)>/<exeNr (int)>

		if (pbRegex.test(msg.address)) {
			const pbId = msg.address.match(pbRegex)[1]
			const pbVal = parseFloat(msg.args)
			const pbValPercent = Math.round(pbVal * 100)
			this.playbacks[pbId].value = pbValPercent
			this.setVariableValues({
				['pb' + pbId]: pbValPercent,
			})
			this.log('debug', 'pbId: ' + pbId + ' value: ' + pbValPercent)
		} else if (pbFlashRegex.test(msg.address)) {
			const pbId = msg.address.match(pbFlashRegex)[1]
			const pbFlash = parseInt(msg.args)
			this.playbacks[pbId].flash = pbFlash
			this.setVariableValues({
				['pb' + pbId + '_flash']: pbFlash,
			})
			this.log('debug', 'pbId: ' + pbId + ' flash: ' + pbFlash)
		} else if (execRegex.test(msg.address)) {
			const execPage = msg.address.match(execRegex)[1]
			const execNr = msg.address.match(execRegex)[2]
			const execVal = parseFloat(msg.args)
			const execValPercent = Math.round(execVal * 100)
			this.log('debug', 'execPage: ' + execPage + ' execNr: ' + execNr + ' value: ' + execValPercent)
			// check if execPage and execNr exist yet
			if (this.execs[execPage] === undefined) {
				this.execs[execPage] = []
			}
			if (this.execs[execPage][execNr] === undefined) {
				// need to add the variable to companion
				this.variables.push({
					variableId: 'exec' + execPage + '_' + execNr,
					name: 'Execute Page ' + execPage + ', Exec ' + execNr,
				})
				this.setVariableDefinitions(this.variables)
			}
			this.setVariableValues({
				['exec' + execPage + '_' + execNr]: execValPercent,
			})
			// set the value in the execs array
			this.execs[execPage][execNr] = execValPercent
		} else {
			return
		}
		// update feedbacks
		this.checkFeedbacks()
	}

	async setupOSC() {
		this.updateStatus(InstanceStatus.Connecting)

		if (this.osc) {
			this.osc.close()
		}
		if (this.companionOsc) {
			this.companionOsc.close()
		}
		this.osc = new osc.UDPPort({
			localAddress: '0.0.0.0',
			localPort: this.config.rxPort,
			remoteAddress: this.config.host,
			remotePort: this.config.port,
		})
		this.companionOsc = new osc.UDPPort({
			localAddress: '0.0.0.0',
			remoteAddress: '127.0.0.1',
			remotePort: this.config.forwardPort,
		})
		this.companionOsc.open()
		this.osc.on('ready', () => {
			this.log('debug', 'OSC ready')
			this.updateStatus(InstanceStatus.Connecting)

			this.sendOSC('/feedback/pb+exec')
		})
		this.osc.on('message', (msg) => {
			this.log('debug', 'OSC message: ' + msg.address + ' ' + msg.args)
			this.updateStatus(InstanceStatus.Ok)

			this.checkVariables(msg)

			// check if we need to forward the message to Companion
			if (this.config.forwardOSC && this.config.forwardPort) {
				this.companionOsc.send({
					address: msg.address,
					args: msg.args,
				})
				this.log('debug', 'Forwarding OSC message to Companion: ' + msg.address + ' ' + msg.args)
			}
		})
		this.osc.on('error', (err) => {
			this.log('error', 'OSC error: ' + err)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})
		this.osc.open()
	}

	sendOSC(cmd, args = null) {
		if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
			if (args === null) {
				args = []
			}
			this.log('debug', 'sendOSC: ' + cmd + ' ' + JSON.stringify(args))
			this.osc.send({
				address: cmd,
				args: args,
			})
		} else {
			this.log('error', 'Could not send OSC: host or port not defined')
		}
	}

	async destroy() {
		this.log('debug', 'destroy')
		this.osc.close()
	}

	async configUpdated(config) {
		this.config = config
		this.init(config)
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					'To enable OSC on MagicQ you need to set the mode, and the transmit/receive port numbers in Setup, View Settings, Network. Setting a port to 0 disables transmitting/receiving of OSC. The OSC TX IP will also need to be set to the IP of this Companion instance to recieve feedback. More information is available in the MagicQ manual here: https://docs.chamsys.co.uk/magicq/open-sound-control/OSC.html',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				tooltip: 'The IP of the Chamsys console',
				default: '127.0.0.1',
				width: 6,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				tooltip: 'The OSC RX port of the Chamsys console',
				default: '8000',
				width: 4,
				regex: Regex.PORT,
			},
			{
				type: 'textinput',
				id: 'rxPort',
				label: 'Feedback Port',
				tooltip: 'The OSC TX port of the Chamsys console',
				default: '9000',
				width: 4,
				regex: Regex.PORT,
			},
			{
				type: 'checkbox',
				id: 'forwardOSC',
				label: 'Forward OSC messages to Companion',
				tooltip:
					'If checked, all OSC messages received from the Chamsys console will be forwarded to Companion at the port below, allowing MagicQ to control Companion with OSC Commands.',
				default: false,
				width: 6,
			},
			{
				type: 'textinput',
				id: 'forwardPort',
				label: 'Companion OSC Listen Port',
				tooltip:
					'The port to forward OSC messages to Companion (you con enable this and find the port in the Companion Settings)',
				default: '12321',
				width: 4,
				regex: Regex.PORT,
				isVisible: (options) => {
					return options.forwardOSC
				},
			},
		]
	}

	updateActions() {
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var pbVal = await this.parseVariablesInString(action.options.pbVal)

					var arg = {
						type: 'i',
						value: pbVal,
					}
					this.sendOSC('/pb/' + pbId, arg)
					// set the value in the playbacks array since magicQ does not send feedback for OSC commands
					this.playbacks[pbId].value = pbVal
					this.setVariableValues({
						['pb' + pbId]: pbVal,
					})
					this.checkFeedbacks()
				},
			},

			pbAdjust: {
				name: 'Adjust Playback Level',
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
						label: 'Fader value to increment or decrement by (-100% - 100%)',
						id: 'pbVal',
						default: '',
						regex: Regex.SIGNED_NUMBER,
					},
				],
				callback: async (action) => {
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var pbVal = await this.parseVariablesInString(action.options.pbVal)
					// get the current value of the playback
					var pbNewLevel = this.playbacks[pbId].value + parseInt(pbVal)
					// check if the new level is greater than 100 or less than 0
					if (pbNewLevel > 100) {
						pbNewLevel = 100
					} else if (pbNewLevel < 0) {
						pbNewLevel = 0
					}

					var arg = {
						type: 'i',
						value: pbNewLevel,
					}
					this.sendOSC('/pb/' + pbId, arg)
					// set the value in the playbacks array since magicQ does not send feedback for OSC commands
					this.playbacks[pbId].value = pbNewLevel
					this.setVariableValues({
						['pb' + pbId]: pbNewLevel,
					})
					this.checkFeedbacks()
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					this.sendOSC('/pb/' + pbId + '/go')
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
						label: 'Action',
						id: 'pbFId',
						choices: [
							{ id: '1', label: 'Flash On' },
							{ id: '0', label: 'Flash Off' },
							{ id: '2', label: 'Flash Toggle' },
						],
						default: '1',
					},
				],
				callback: async (action) => {
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var flashVal = await this.parseVariablesInString(action.options.pbFId)
					flashVal = parseInt(flashVal)

					// handle toggle
					if (flashVal === 2) {
						flashVal = this.playbacks[pbId].flash === 1 ? 0 : 1
					}
					var arg = {
						type: 'i',
						value: flashVal,
					}
					this.sendOSC('/pb/' + pbId + '/flash', arg)
					// set the value in the playbacks array since magicQ does not send feedback for OSC commands
					this.playbacks[pbId].flash = action.options.pbFId
					this.setVariableValues({
						['pb' + pbId + '_flash']: action.options.pbFId,
					})
					this.checkFeedbacks()
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					this.sendOSC('/pb/' + pbId + '/pause')
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					this.sendOSC('/pb/' + pbId + '/release')
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var cue = await this.parseVariablesInString(action.options.cue)
					this.sendOSC('/pb/' + pbId + '/' + cue)
				},
			},

			dbo: {
				name: 'Desk Black Out DBO',
				options: [
					{
						type: 'dropdown',
						label: 'Action',
						id: 'dboId',
						choices: [
							{ id: '1', label: 'Black Out On' },
							{ id: '0', label: 'Black Out Off' },
							{ id: '2', label: 'Black Out Toggle' },
						],
						default: '1',
					},
				],
				callback: async (action) => {
					var dboVal = await this.parseVariablesInString(action.options.dboId)
					dboVal = parseInt(dboVal)
					// handle toggle
					if (dboVal === 2) {
						dboVal = this.playbacks[1].flash === 1 ? 0 : 1
					}
					var arg = {
						type: 'i',
						value: dboVal,
					}
					this.sendOSC('/dbo', arg)
				},
			},

			swap: {
				name: 'Set swap mode',
				options: [
					{
						type: 'dropdown',
						label: 'Swap Mode',
						id: 'swapId',
						choices: [
							{ id: '0', label: 'Add' },
							{ id: '1', label: 'Swap' },
						],
						default: '0',
					},
				],
				callback: (action) => {
					var arg = {
						type: 'i',
						value: action.options.swapId,
					}
					this.sendOSC('/swap', arg)
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
						type: 'checkbox',
						label: 'Toggle?',
						id: 'exeToggle',
						default: false,
						tooltip: 'If checked, this action will just toggle the execute button',
					},
					{
						type: 'textinput',
						label: 'Execute Level: 0 - 100 %',
						tooltip: '0 = Release, 1 - 100 = Activate or Fader Level',
						id: 'exeVal',
						default: '1',
						regex: Regex.NUMBER,
						isVisible: (options) => {
							return !options.exeToggle
						},
					},
				],
				callback: async (action) => {
					var exeP = await this.parseVariablesInString(action.options.exeP)
					var exeNr = await this.parseVariablesInString(action.options.exeNr)
					var exeVal = await this.parseVariablesInString(action.options.exeVal)
					var exeToggle = action.options.exeToggle
					exeVal = parseInt(exeVal)
					// handle toggle
					if (exeToggle) {
						if (this.execs[exeP][exeNr] === undefined) {
							exeVal = 100
						} else {
							exeVal = this.execs[exeP][exeNr] > 0 ? 0 : 100
						}
					}
					var arg = {
						type: 'f',
						value: exeVal / 100,
					}
					this.sendOSC('/exec/' + exeP + '/' + exeNr, arg)
					// set the value in the execs array since magicQ does not send feedback for OSC commands
					if (this.execs[exeP] === undefined) {
						this.execs[exeP] = []
					}
					if (this.execs[exeP][exeNr] === undefined) {
						// need to add the variable to companion
						this.variables.push({
							variableId: 'exec' + exeP + '_' + exeNr,
							name: 'Execute Page ' + exeP + ', Exec ' + exeNr,
						})
						this.setVariableDefinitions(this.variables)
					}
					this.setVariableValues({
						['exec' + exeP + '_' + exeNr]: exeVal,
					})
					this.execs[exeP][exeNr] = exeVal
					this.checkFeedbacks()
				},
			},

			executeAdjust: {
				name: 'Adjust Execute Level',
				options: [
					{
						type: 'textinput',
						label: 'Execute Page (1-10)',
						id: 'exeP',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Execute Number',
						id: 'exeNr',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Execute value to increment or decrement by (-100% - 100%)',
						id: 'exeVal',
						default: '',
						regex: Regex.SIGNED_NUMBER,
					},
				],
				callback: async (action) => {
					var exeP = await this.parseVariablesInString(action.options.exeP)
					var exeNr = await this.parseVariablesInString(action.options.exeNr)
					var exeVal = await this.parseVariablesInString(action.options.exeVal)
					// chack if we have a current value of the execute
					if (this.execs[exeP] === undefined) {
						this.execs[exeP] = []
					}
					if (this.execs[exeP][exeNr] === undefined) {
						this.execs[exeP][exeNr] = 0
					}
					// get the current value of the playback
					var exeNewLevel = this.execs[exeP][exeNr] + parseInt(exeVal)
					// check if the new level is greater than 100 or less than 0
					if (exeNewLevel > 100) {
						exeNewLevel = 100
					} else if (exeNewLevel < 0) {
						exeNewLevel = 0
					}

					var arg = {
						type: 'f',
						value: exeNewLevel / 100,
					}
					this.sendOSC('/exec/' + exeP + '/' + exeNr, arg)
					this.setVariableValues({
						['exec' + exeP + '_' + exeNr]: exeNewLevel,
					})
					this.execs[exeP][exeNr] = exeNewLevel
					this.checkFeedbacks()
				},
			},

			tenScene: {
				name: '10 Scene',
				options: [
					{
						type: 'textinput',
						label: '10Scene Item',
						id: 'tenSceneItem',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: '10Scene Zone',
						id: 'tenSceneZone',
						default: '1',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: '10Scene Level: 0.0 = Release, 1.0 = Activate, 0.0-1.0 = Fader Level',
						id: 'tenSceneVal',
						default: '1',
						regex: Regex.FLOAT_OR_INT,
					},
				],
				callback: async (action) => {
					var tenSceneItem = await this.parseVariablesInString(action.options.tenSceneItem)
					var tenSceneZone = await this.parseVariablesInString(action.options.tenSceneZone)
					var tenSceneVal = await this.parseVariablesInString(action.options.tenSceneVal)

					var arg = {
						type: 'f',
						value: tenSceneVal,
					}
					this.sendOSC('/10scene/' + tenSceneItem + '/' + tenSceneZone, arg)
				},
			},

			rpc: {
				name: 'RPC Command',
				options: [
					{
						type: 'textinput',
						label: 'RPC Command',
						id: 'rpcCmd',
						default: '',
					},
				],
				callback: async (action) => {
					var rpcCmd = await this.parseVariablesInString(action.options.rpcCmd)

					var arg = {
						type: 's',
						value: rpcCmd,
					}
					this.sendOSC('/rpc', arg)
				},
			},
		})
	}
}

runEntrypoint(MagicQInstance, [])
