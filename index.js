const { InstanceBase, Regex, runEntrypoint, InstanceStatus, combineRgb } = require('@companion-module/base')
const osc = require('osc')

class MagicQInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.osc = new osc.UDPPort({})

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

		this.updateStatus('ok')
		this.updateActions()

		if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
			this.setupOSC()
		}

		this.initVariables()
		this.initFeedbacks()
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
				description: 'Set feedback for playback level',
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
				description: 'Set feedback for playback flash',
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
				description: 'Set feedback for execute level',
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
		this.osc = new osc.UDPPort({
			localAddress: '0.0.0.0',
			localPort: this.config.rxPort,
			remoteAddress: this.config.host,
			remotePort: this.config.port,
		})
		this.osc.on('ready', () => {
			this.log('debug', 'OSC ready')
			this.updateStatus(InstanceStatus.Connecting)
			this.sendOSC('/feedback/pb+exec')
		})
		this.osc.on('message', (msg) => {
			this.log('debug', 'OSC message: ' + msg.address + ' ' + msg.args)
			this.updateStatus(InstanceStatus.Ok)

			this.checkVariables(msg)
		})
		this.osc.on('error', (err) => {
			this.log('error', 'OSC error: ' + err)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})
		this.osc.open()
	}

	sendOSC(cmd, arg = null, preferFloat = false) {
		if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
			var args = []
			// check if string, int, or float
			if (arg) {
				if (typeof arg === 'string') {
					args.push({ type: 's', value: arg })
				} else if (typeof arg === 'number') {
					if (preferFloat) {
						args.push({ type: 'f', value: arg })
					} else {
						args.push({ type: 'i', value: arg })
					}
				}
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
			{
				type: 'textinput',
				id: 'rxPort',
				label: 'Feedback Port',
				width: 4,
				regex: Regex.PORT,
			},
		]
	}

	updateActions() {
		const sendOSC = (cmd, arg = null) => {
			if (this.config.host && this.config.port && this.config.port > 0 && this.config.port < 65536) {
				if (arg) {
					this.log('debug', cmd + ': ' + arg)
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var pbVal = await this.parseVariablesInString(action.options.pbVal)

					var arg = {
						type: 'i',
						value: pbVal,
					}
					sendOSC('/pb/' + pbId, arg)
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
					sendOSC('/pb/' + pbId, arg)
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
					var pbId = await this.parseVariablesInString(action.options.pbId)

					var arg = {
						type: 'i',
						value: action.options.pbFId,
					}
					sendOSC('/pb/' + pbId + '/flash', arg)
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
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
					var pbId = await this.parseVariablesInString(action.options.pbId)
					var cue = await this.parseVariablesInString(action.options.cue)
					sendOSC('/pb/' + pbId + '/' + cue)
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
					},
				],
				callback: (action) => {
					var arg = {
						type: 'i',
						value: action.options.swapId,
					}
					sendOSC('/swap', arg)
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
						label: 'Execute Level: 0 - 100 %',
						tooltip: '0 = Release, 1 - 100 = Activate or Fader Level',
						id: 'exeVal',
						default: '1',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					var exeP = await this.parseVariablesInString(action.options.exeP)
					var exeNr = await this.parseVariablesInString(action.options.exeNr)
					var exeVal = await this.parseVariablesInString(action.options.exeVal)

					var arg = {
						type: 'i',
						value: exeVal,
					}
					sendOSC('/exec/' + exeP + '/' + exeNr, arg)
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
					// get the current value of the playback
					var exeNewLevel = this.execs[exeP][exeNr] + parseInt(exeVal)
					// check if the new level is greater than 100 or less than 0
					if (exeNewLevel > 100) {
						exeNewLevel = 100
					} else if (exeNewLevel < 0) {
						exeNewLevel = 0
					}

					var arg = {
						type: 'i',
						value: exeNewLevel,
					}
					sendOSC('/exec/' + exeP + '/' + exeNr, arg)
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
					sendOSC('/10scene/' + tenSceneItem + '/' + tenSceneZone, arg)
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
					sendOSC('/rpc', arg)
				},
			},
		})
	}
}

runEntrypoint(MagicQInstance, [])
