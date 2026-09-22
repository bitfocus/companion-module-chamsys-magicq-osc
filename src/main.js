import { InstanceBase, InstanceStatus } from '@companion-module/base'
import osc from 'osc'

import UpdateActions from './actions.js'
import UpdateFeedbacks from './feedbacks.js'
import UpdateVariableDefinitions from './variables.js'
import UpgradeScripts from './upgrades.js'

export default class MagicQInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// sockets are created in setupOSC(), once the config is known
		this.osc = null
		this.companionOsc = null

		// objects for playbacks and executes
		this.playbacks = []
		for (let i = 1; i <= 10; i++) {
			this.playbacks[i] = {
				value: 0,
				flash: 0,
			}
		}
		this.execs = []
		for (let i = 1; i <= 10; i++) {
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
		this.updateVariableDefinitions()
		this.updateFeedbacks()

		this.setupOSC()
	}

	feedbackEnabled() {
		return !!this.config.enableFeedback
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
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
}

export { UpgradeScripts }
