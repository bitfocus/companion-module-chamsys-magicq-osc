import { InstanceBase, Regex, InstanceStatus, combineRgb } from '@companion-module/base'
import osc from 'osc'

export default class MagicQInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// sockets are created in setupOSC(), once the config is known
		this.osc = null
		this.companionOsc = null

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
		// desk black out state, tracked so the DBO toggle has something to read
		this.dbo = 0
		this.variables = {}
	}

	async init(config) {
		this.config = config

		// Actions do not depend on the connection, so always register them.
		// Otherwise a bad config would leave buttons with no actions to call.
		this.updateActions()
		// Variables and feedbacks only ever reflect what this module sent, not
		// what the console is actually doing, unless feedback is enabled - so
		// they are registered only in that case.
		this.initVariables()
		this.initFeedbacks()

		this.setupOSC()
	}

	feedbackEnabled() {
		return !!this.config.enableFeedback
	}

	async initVariables() {
		this.variables = {}

		if (this.feedbackEnabled()) {
			for (var i = 1; i <= 10; i++) {
				this.variables['pb' + i] = { name: 'Playback ' + i + ' Level' }

				this.variables['pb' + i + '_flash'] = { name: 'Playback ' + i + ' Flash' }
			}
		}

		// Always publish, so turning feedback off clears any previously
		// registered variables rather than leaving them behind stale.
		this.setVariableDefinitions(this.variables)
	}

	// No-op when feedback is disabled, since the variables are not registered
	// then. State tracking on this.playbacks / this.execs continues regardless,
	// because the action toggles depend on it.
	setTrackedVariables(values) {
		if (this.feedbackEnabled()) {
			this.setVariableValues(values)
		}
	}

	clamp(value, min, max) {
		return Math.min(Math.max(value, min), max)
	}

	// Option values arrive as strings and can be driven by variables, so they
	// may be empty or non-numeric whatever the field's regex says. Returns
	// undefined rather than NaN, which would otherwise be sent to the console
	// or used to index into the playback / execute state.
	parseOption(value, min, max) {
		const parsed = parseInt(value, 10)
		if (!Number.isFinite(parsed)) {
			return undefined
		}
		return min === undefined ? parsed : this.clamp(parsed, min, max)
	}

	// As parseOption, for the fields that take a decimal (cue numbers, 10Scene
	// levels). Bounds are optional, since cue numbers have no fixed range.
	parseFloatOption(value, min, max) {
		const parsed = parseFloat(value)
		if (!Number.isFinite(parsed)) {
			return undefined
		}
		return min === undefined ? parsed : this.clamp(parsed, min, max)
	}

	// Config values arrive as strings, so coerce and validate before handing
	// them to dgram. Returns undefined when the value is not a usable port.
	parsePort(value) {
		const port = parseInt(value, 10)
		return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined
	}

	// Execute variables are not known up front, so they are registered the
	// first time a given page/number is seen - from feedback or from an action.
	// The page array is always created: the Execute toggle reads it whether or
	// not feedback is enabled.
	ensureExecVariable(execPage, execNr) {
		if (this.execs[execPage] === undefined) {
			this.execs[execPage] = []
		}

		if (!this.feedbackEnabled()) {
			return
		}

		const variableId = 'exec' + execPage + '_' + execNr
		if (this.variables[variableId] === undefined) {
			this.variables[variableId] = { name: 'Execute Page ' + execPage + ', Exec ' + execNr }
			this.setVariableDefinitions(this.variables)
		}
	}

	async initFeedbacks() {
		if (!this.feedbackEnabled()) {
			// Publish an empty set, so turning feedback off clears any
			// previously registered feedbacks rather than leaving them behind.
			this.setFeedbackDefinitions({})
			return
		}

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
						useVariables: true,
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
						type: 'textinput',
						label: 'Playback value (0-100)',
						id: 'pbVal',
						default: '0',
						regex: Regex.NUMBER,
						useVariables: true,
						isVisibleExpression: '$(options:pbComp) != "isActive"',
					},
				],
				callback: (feedback) => {
					var pbId = this.parseOption(feedback.options.pbId, 1, 10)
					var pbVal = this.parseOption(feedback.options.pbVal, 0, 100)
					var pbComp = feedback.options.pbComp
					if (pbId === undefined || (pbComp !== 'isActive' && pbVal === undefined)) {
						return false
					}
					var pbLevel = this.playbacks[pbId].value

					switch (pbComp) {
						case 'isActive':
							return pbLevel > 0
						case 'equal':
							return pbLevel === pbVal
						case 'notEqual':
							return pbLevel !== pbVal
						case 'greater':
							return pbLevel > pbVal
						case 'greaterEqual':
							return pbLevel >= pbVal
						case 'less':
							return pbLevel < pbVal
						case 'lessEqual':
							return pbLevel <= pbVal
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
						useVariables: true,
					},
				],
				callback: (feedback) => {
					var pbId = this.parseOption(feedback.options.pbId, 1, 10)
					if (pbId === undefined) {
						return false
					}
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
						type: 'textinput',
						label: 'Execute Page',
						id: 'execPage',
						default: '1',
						regex: Regex.NUMBER,
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Execute Number',
						id: 'execNumber',
						default: '1',
						regex: Regex.NUMBER,
						useVariables: true,
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
						type: 'textinput',
						label: 'Execute value (0-100)',
						id: 'execVal',
						default: '0',
						regex: Regex.NUMBER,
						useVariables: true,
						isVisibleExpression: '$(options:execComp) != "isActive"',
					},
				],
				callback: (feedback) => {
					var execPage = this.parseOption(feedback.options.execPage, 1, 10)
					var execNumber = this.parseOption(feedback.options.execNumber)
					var execVal = this.parseOption(feedback.options.execVal, 0, 100)
					var execComp = feedback.options.execComp
					if (
						execPage === undefined ||
						execNumber === undefined ||
						(execComp !== 'isActive' && execVal === undefined)
					) {
						return false
					}
					var execLevel = this.execs[execPage][execNumber]

					switch (execComp) {
						case 'isActive':
							return execLevel > 0
						case 'equal':
							return execLevel === execVal
						case 'notEqual':
							return execLevel !== execVal
						case 'greater':
							return execLevel > execVal
						case 'greaterEqual':
							return execLevel >= execVal
						case 'less':
							return execLevel < execVal
						case 'lessEqual':
							return execLevel <= execVal
					}
				},
			},
		})
	}

	// MagicQ's OSC spec addresses playbacks 1-10, but the address patterns match
	// any number and nothing stops another sender reaching this port. Anything
	// outside the range has no slot in this.playbacks, so it is ignored rather
	// than allowed to throw.
	isKnownPlayback(pbId) {
		if (this.playbacks[pbId] !== undefined) {
			return true
		}
		this.log('debug', 'Ignoring OSC message for playback ' + pbId + ', outside the 1-10 range MagicQ addresses')
		return false
	}

	async checkVariables(msg) {
		const pbRegex = /\/pb\/(\d+)$/ // regex for /pb/<pbId (int)>
		const pbFlashRegex = /\/pb\/(\d+)\/flash$/ // regex for /pb/<pbId (int)>/flash
		const execRegex = /\/exec\/(\d+)\/(\d+)$/ // regex for /exec/<exeP (int)>/<exeNr (int)>

		if (pbRegex.test(msg.address)) {
			const pbId = msg.address.match(pbRegex)[1]
			if (!this.isKnownPlayback(pbId)) {
				return
			}
			const pbVal = parseFloat(msg.args)
			const pbValPercent = Math.round(pbVal * 100)
			this.playbacks[pbId].value = pbValPercent
			this.setTrackedVariables({
				['pb' + pbId]: pbValPercent,
			})
			this.checkFeedbacks('pb')
			this.log('debug', 'pbId: ' + pbId + ' value: ' + pbValPercent)
		} else if (pbFlashRegex.test(msg.address)) {
			const pbId = msg.address.match(pbFlashRegex)[1]
			if (!this.isKnownPlayback(pbId)) {
				return
			}
			const pbFlash = parseInt(msg.args)
			this.playbacks[pbId].flash = pbFlash
			this.setTrackedVariables({
				['pb' + pbId + '_flash']: pbFlash,
			})
			this.checkFeedbacks('pbFlash')
			this.log('debug', 'pbId: ' + pbId + ' flash: ' + pbFlash)
		} else if (execRegex.test(msg.address)) {
			const execPage = msg.address.match(execRegex)[1]
			const execNr = msg.address.match(execRegex)[2]
			const execVal = parseFloat(msg.args)
			const execValPercent = Math.round(execVal * 100)
			this.log('debug', 'execPage: ' + execPage + ' execNr: ' + execNr + ' value: ' + execValPercent)
			this.ensureExecVariable(execPage, execNr)
			this.setTrackedVariables({
				['exec' + execPage + '_' + execNr]: execValPercent,
			})
			// set the value in the execs array
			this.execs[execPage][execNr] = execValPercent
			this.checkFeedbacks('exec')
		} else {
			return
		}
	}

	closeOSC() {
		for (const port of [this.osc, this.companionOsc]) {
			if (!port) {
				continue
			}
			try {
				port.close()
			} catch (err) {
				this.log('debug', 'Error closing OSC port: ' + err)
			}
		}
		this.osc = null
		this.companionOsc = null
	}

	async setupOSC() {
		this.closeOSC()

		const remotePort = this.parsePort(this.config.port)
		if (!this.config.host || remotePort === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'Target IP and port must be set')
			return
		}

		const feedbackEnabled = !!this.config.enableFeedback
		const rxPort = this.parsePort(this.config.rxPort)
		if (feedbackEnabled && rxPort === undefined) {
			this.updateStatus(InstanceStatus.BadConfig, 'Feedback port must be set when feedback is enabled')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		// Open the forwarding socket first, so it is ready before the first
		// message can arrive on the socket below.
		if (feedbackEnabled && this.config.forwardOSC) {
			const forwardPort = this.parsePort(this.config.forwardPort)
			if (forwardPort === undefined) {
				this.log('error', 'OSC forwarding is enabled but the Companion listen port is not valid')
			} else {
				const companionPort = new osc.UDPPort({
					localAddress: '0.0.0.0',
					// This socket only ever sends, so it never needs a predictable port.
					// osc.js defaults localPort to 57121, which collides as soon as a
					// second instance (or a reconnect) tries to bind it, so ask for an
					// ephemeral port instead.
					localPort: 0,
					remoteAddress: '127.0.0.1',
					remotePort: forwardPort,
				})
				companionPort.on('ready', () => {
					this.log('debug', 'OSC forwarding ready on port ' + companionPort.socket.address().port)
				})
				// Without a listener an EADDRINUSE here would take down the whole module
				companionPort.on('error', (err) => {
					this.log('error', 'OSC forwarding error: ' + err)
				})
				this.companionOsc = companionPort
				companionPort.open()
			}
		}

		const oscPort = new osc.UDPPort({
			localAddress: '0.0.0.0',
			// Only claim the configured feedback port when the console is actually
			// transmitting to it. With feedback off nothing needs to reach us on a
			// known port, so bind 0 and let the OS pick a free one - otherwise every
			// instance would fight over the same port and fail with EADDRINUSE.
			localPort: feedbackEnabled ? rxPort : 0,
			remoteAddress: this.config.host,
			remotePort: remotePort,
		})

		oscPort.on('ready', () => {
			this.log('debug', 'OSC ready on port ' + oscPort.socket.address().port)

			if (feedbackEnabled) {
				// Stay in Connecting until the console actually sends something back
				this.sendOSC('/feedback/pb+exec')
			} else {
				// Send-only on a connectionless socket, so there is nothing to wait for
				this.updateStatus(InstanceStatus.Ok)
			}
		})
		oscPort.on('message', (msg) => {
			this.log('debug', 'OSC message: ' + msg.address + ' ' + msg.args)
			this.updateStatus(InstanceStatus.Ok)

			// checkVariables is async, so an unhandled rejection here would be
			// fatal - a malformed message must never take the module down
			this.checkVariables(msg).catch((err) => {
				this.log('error', 'Error handling OSC message ' + msg.address + ': ' + err)
			})

			// check if we need to forward the message to Companion
			if (this.companionOsc) {
				this.companionOsc.send({
					address: msg.address,
					args: msg.args,
				})
				this.log('debug', 'Forwarding OSC message to Companion: ' + msg.address + ' ' + msg.args)
			}
		})
		oscPort.on('error', (err) => {
			this.log('error', 'OSC error: ' + err)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})

		this.osc = oscPort
		oscPort.open()
	}

	sendOSC(cmd, args = null) {
		if (this.osc === null) {
			this.log('error', 'Could not send OSC: not connected, check the module config')
			return
		}

		if (args === null) {
			args = []
		}
		this.log('debug', 'sendOSC: ' + cmd + ' ' + JSON.stringify(args))
		this.osc.send({
			address: cmd,
			args: args,
		})
	}

	async destroy() {
		this.log('debug', 'destroy')
		this.closeOSC()
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
				type: 'checkbox',
				id: 'enableFeedback',
				label: 'Enable Feedback',
				tooltip: 'Requires feedback to be enabled on the Chamsys console OSC settings',
				default: true,
			},
			{
				type: 'textinput',
				id: 'rxPort',
				label: 'Feedback Port',
				tooltip: 'The OSC TX port of the Chamsys console',
				default: '9000',
				width: 4,
				regex: Regex.PORT,
				isVisibleExpression: '$(options:enableFeedback) == true',
			},
			{
				type: 'checkbox',
				id: 'forwardOSC',
				label: 'Forward OSC messages to Companion',
				tooltip:
					'If checked, all OSC messages received from the Chamsys console will be forwarded to Companion at the port below, allowing MagicQ to control Companion with OSC Commands.',
				default: false,
				width: 6,
				isVisibleExpression: '$(options:enableFeedback) == true',
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
				isVisibleExpression: '$(options:forwardOSC) == true && $(options:enableFeedback) == true',
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Fader value (0-100 %)',
						id: 'pbVal',
						default: '',
						regex: Regex.NUMBER,
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					var pbVal = this.parseOption(action.options.pbVal, 0, 100)
					if (pbId === undefined || pbVal === undefined) {
						this.log('warn', 'Set playback fader: playback and level must both be numbers')
						return
					}

					var arg = {
						type: 'i',
						value: pbVal,
					}
					this.sendOSC('/pb/' + pbId, arg)
					// set the value in the playbacks array since magicQ does not send feedback for OSC commands
					this.playbacks[pbId].value = pbVal
					this.setTrackedVariables({
						['pb' + pbId]: pbVal,
					})
					this.checkFeedbacks('pb')
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Fader value to increment or decrement by (-100% - 100%)',
						id: 'pbVal',
						default: '',
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					var pbVal = this.parseOption(action.options.pbVal, -100, 100)
					if (pbId === undefined || pbVal === undefined) {
						this.log('warn', 'Adjust playback level: playback and amount must both be numbers')
						return
					}
					// get the current value of the playback
					var pbNewLevel = this.playbacks[pbId].value + pbVal
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
					this.setTrackedVariables({
						['pb' + pbId]: pbNewLevel,
					})
					this.checkFeedbacks('pb')
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
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					if (pbId === undefined) {
						this.log('warn', 'Go on playback: playback must be a number')
						return
					}
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
						useVariables: true,
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
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					var flashVal = this.clamp(parseInt(action.options.pbFId), 0, 2)
					if (pbId === undefined) {
						this.log('warn', 'Flash playback: playback must be a number')
						return
					}

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
					// store the resolved value, not the dropdown id, so toggle and the feedback agree
					this.playbacks[pbId].flash = flashVal
					this.setTrackedVariables({
						['pb' + pbId + '_flash']: flashVal,
					})
					this.checkFeedbacks('pbFlash')
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
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					if (pbId === undefined) {
						this.log('warn', 'Pause playback: playback must be a number')
						return
					}
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
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					if (pbId === undefined) {
						this.log('warn', 'Release playback: playback must be a number')
						return
					}
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Cue Number',
						id: 'cue',
						default: '1',
						regex: Regex.FLOAT_OR_INT,
						useVariables: true,
					},
				],
				callback: async (action) => {
					var pbId = this.parseOption(action.options.pbId, 1, 10)
					var cue = this.parseFloatOption(action.options.cue)
					if (pbId === undefined || cue === undefined) {
						this.log('warn', 'Jump to cue: playback and cue number must both be numbers')
						return
					}
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
					var dboVal = this.clamp(parseInt(action.options.dboId), 0, 2)
					// handle toggle
					if (dboVal === 2) {
						dboVal = this.dbo === 1 ? 0 : 1
					}
					var arg = {
						type: 'i',
						value: dboVal,
					}
					this.sendOSC('/dbo', arg)
					// magicQ does not send feedback for OSC commands, so track the
					// resolved state here for the next toggle
					this.dbo = dboVal
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
						value: parseInt(action.options.swapId),
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Execute Nr',
						id: 'exeNr',
						default: '1',
						regex: Regex.NUMBER,
						useVariables: true,
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
						useVariables: true,
						isVisibleExpression: '!$(options:exeToggle)',
					},
				],
				callback: async (action) => {
					var exeP = this.parseOption(action.options.exeP)
					var exeNr = this.parseOption(action.options.exeNr)
					var exeVal = this.parseOption(action.options.exeVal, 0, 100)
					if (exeP === undefined || exeNr === undefined || exeVal === undefined) {
						this.log('warn', 'Execute: page, number and level must all be numbers')
						return
					}
					var exeToggle = action.options.exeToggle
					// magicQ does not send feedback for OSC commands, so this module
					// tracks the state itself - make sure there is somewhere to put it
					this.ensureExecVariable(exeP, exeNr)
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
					this.setTrackedVariables({
						['exec' + exeP + '_' + exeNr]: exeVal,
					})
					this.execs[exeP][exeNr] = exeVal
					this.checkFeedbacks('exec')
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Execute Number',
						id: 'exeNr',
						default: '1',
						regex: Regex.NUMBER,
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Execute value to increment or decrement by (-100% - 100%)',
						id: 'exeVal',
						default: '',
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
				],
				callback: async (action) => {
					var exeP = this.parseOption(action.options.exeP, 1, 10)
					var exeNr = this.parseOption(action.options.exeNr, 1, 100)
					var exeVal = this.parseOption(action.options.exeVal, -100, 100)
					if (exeP === undefined || exeNr === undefined || exeVal === undefined) {
						this.log('warn', 'Adjust execute level: page, number and amount must all be numbers')
						return
					}
					// check if we have a current value of the execute
					this.ensureExecVariable(exeP, exeNr)
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
					this.setTrackedVariables({
						['exec' + exeP + '_' + exeNr]: exeNewLevel,
					})
					this.execs[exeP][exeNr] = exeNewLevel
					this.checkFeedbacks('exec')
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
						useVariables: true,
					},
					{
						type: 'textinput',
						label: '10Scene Zone',
						id: 'tenSceneZone',
						default: '1',
						regex: Regex.NUMBER,
						useVariables: true,
					},
					{
						type: 'textinput',
						label: '10Scene Level: 0.0 = Release, 1.0 = Activate, 0.0-1.0 = Fader Level',
						id: 'tenSceneVal',
						default: '1',
						regex: Regex.FLOAT_OR_INT,
						useVariables: true,
					},
				],
				callback: async (action) => {
					var tenSceneItem = this.parseOption(action.options.tenSceneItem)
					var tenSceneZone = this.parseOption(action.options.tenSceneZone)
					var tenSceneVal = this.parseFloatOption(action.options.tenSceneVal, 0, 1)
					if (tenSceneItem === undefined || tenSceneZone === undefined || tenSceneVal === undefined) {
						this.log('warn', '10Scene: item, zone and level must all be numbers')
						return
					}

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
						useVariables: true,
					},
				],
				callback: async (action) => {
					var rpcCmd = action.options.rpcCmd

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

export const UpgradeScripts = []
