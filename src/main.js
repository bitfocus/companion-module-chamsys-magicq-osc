import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import osc from 'osc'

import UpdateActions from './actions.js'
import UpdateFeedbacks from './feedbacks.js'
import UpdateVariableDefinitions from './variables.js'
import UpdatePresets from './presets.js'
import UpgradeScripts from './upgrades.js'
import { MAX_EXEC_PAGE, MAX_EXEC_NR } from './constants.js'

// how long to wait for anything from the console before warning
const FEEDBACK_TIMEOUT_MS = 10000
// how long to wait before trying to open the sockets again after a failure
const RECONNECT_DELAY_MS = 5000

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
		for (let i = 1; i <= MAX_EXEC_PAGE; i++) {
			this.execs[i] = []
		}
		// desk black out state, tracked so the DBO toggle has something to read
		this.dbo = 0
		this.variables = {}
		// last status sent to Companion, so repeats are not re-sent per message
		this.lastStatus = null
		// fires when the console has not sent anything back for a while
		this.feedbackTimer = null
		// retries opening the sockets after a failure
		this.reconnectTimer = null
		// set once destroy() has run, so nothing schedules work afterwards
		this.destroyed = false
		// set when the forwarding socket could not be opened, so the connection
		// keeps saying so instead of reporting a plain Ok
		this.forwardingFailed = false
		// whether the console has ever replied, so the "no OSC received" warning
		// is only raised before the first reply
		this.consoleSeen = false
	}

	async init(config) {
		this.config = config
		this.destroyed = false

		// Actions, feedbacks and variables do not depend on the connection, so
		// always register them. Otherwise a bad config, or feedback being turned
		// off, would leave buttons pointing at definitions that no longer exist.
		// With feedback off they reflect what this module sent, as in v3.1.1.
		this.updateActions()
		this.updateVariableDefinitions()
		this.updateFeedbacks()
		// After the actions and feedbacks, since the presets reference them.
		this.updatePresets()

		try {
			this.setupOSC()
		} catch (err) {
			this.log('error', 'Error setting up OSC: ' + err)
			this.setStatus(InstanceStatus.UnknownError, String(err?.message ?? err))
		}
	}

	// Only pass a status on when it changes. The console streams messages while
	// a fader moves, and each one would otherwise be another update to Companion.
	setStatus(status, message = null) {
		const key = status + '|' + (message ?? '')
		if (key === this.lastStatus) {
			return
		}
		this.lastStatus = key
		this.updateStatus(status, message)
	}

	feedbackEnabled() {
		return !!this.config.enableFeedback
	}

	// The status to show while the connection itself is fine. Forwarding is a
	// separate promise to the user, so a connection that cannot forward must not
	// report a plain Ok - otherwise the next message from the console would paint
	// over the warning and hide that MagicQ can no longer reach Companion.
	reportReachable() {
		if (this.forwardingFailed) {
			this.setStatus(InstanceStatus.UnknownWarning, 'OSC forwarding to Companion is not running')
			return
		}
		this.setStatus(InstanceStatus.Ok)
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

	updatePresets() {
		UpdatePresets(this)
	}

	setTrackedVariables(values) {
		this.setVariableValues(values)
	}

	// Current values of every playback and execute this module knows about, so
	// variables can be re-published after their definitions are rebuilt.
	trackedVariableValues() {
		const values = {}
		for (let i = 1; i <= 10; i++) {
			values['pb' + i] = this.playbacks[i].value
			values['pb' + i + '_flash'] = this.playbacks[i].flash
		}
		this.execs.forEach((page, execPage) => {
			page?.forEach((value, execNr) => {
				if (value !== undefined) {
					values['exec' + execPage + '_' + execNr] = value
				}
			})
		})
		return values
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

	// The same rule everywhere: both must be whole numbers from 1 up to the
	// ceiling above. Returns undefined otherwise, rather than clamping to a
	// different execute.
	parseExecTarget(pageValue, nrValue) {
		// Number() rather than parseInt(): parseInt('2.7') is 2 and parseInt('3abc')
		// is 3, so a fractional or trailing-garbage value would silently become a
		// different execute instead of being rejected.
		const execPage = Number(pageValue)
		const execNr = Number(nrValue)
		if (!Number.isInteger(execPage) || execPage < 1 || execPage > MAX_EXEC_PAGE) {
			return undefined
		}
		if (!Number.isInteger(execNr) || execNr < 1 || execNr > MAX_EXEC_NR) {
			return undefined
		}
		return { execPage, execNr }
	}

	// MagicQ addresses playbacks 1-10. Out of that range there is nothing to
	// talk to, so reject rather than clamp: silently driving playback 10 when
	// the button asked for 15 is worse than doing nothing and saying so. Same
	// rule as parseExecTarget.
	parsePlayback(value) {
		const pbId = Number(value)
		if (!Number.isInteger(pbId) || pbId < 1 || pbId > 10) {
			return undefined
		}
		return pbId
	}

	// Current level of an execute, or undefined when it has not been seen yet
	execLevel(execPage, execNr) {
		return this.execs[execPage]?.[execNr]
	}

	// Config values arrive as strings, so coerce and validate before handing
	// them to dgram. Returns undefined when the value is not a usable port.
	parsePort(value) {
		const port = parseInt(value, 10)
		return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined
	}

	// Execute variables are not known up front, so they are registered the
	// first time a given page/number is seen - from feedback or from an action.
	ensureExecVariable(execPage, execNr) {
		if (this.execs[execPage] === undefined) {
			this.execs[execPage] = []
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

	// OSC arguments arrive as a list; MagicQ sends a single number. Returns
	// undefined when the first argument is missing or not a number.
	oscNumber(msg) {
		const arg = Array.isArray(msg.args) ? msg.args[0] : msg.args
		const value = typeof arg === 'object' && arg !== null ? arg.value : arg
		const parsed = typeof value === 'number' ? value : parseFloat(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}

	checkVariables(msg) {
		const pbRegex = /\/pb\/(\d+)$/ // regex for /pb/<pbId (int)>
		const pbFlashRegex = /\/pb\/(\d+)\/flash$/ // regex for /pb/<pbId (int)>/flash
		const execRegex = /\/exec\/(\d+)\/(\d+)$/ // regex for /exec/<exeP (int)>/<exeNr (int)>

		if (pbRegex.test(msg.address)) {
			const pbId = msg.address.match(pbRegex)[1]
			if (!this.isKnownPlayback(pbId)) {
				return
			}
			const pbVal = this.oscNumber(msg)
			if (pbVal === undefined) {
				this.log('debug', 'Ignoring ' + msg.address + ': value is not a number')
				return
			}
			const pbValPercent = Math.round(pbVal * 100)
			this.playbacks[pbId].value = pbValPercent
			this.setTrackedVariables({
				['pb' + pbId]: pbValPercent,
			})
			this.checkFeedbacks('pb')
		} else if (pbFlashRegex.test(msg.address)) {
			const pbId = msg.address.match(pbFlashRegex)[1]
			if (!this.isKnownPlayback(pbId)) {
				return
			}
			const pbFlashVal = this.oscNumber(msg)
			if (pbFlashVal === undefined) {
				this.log('debug', 'Ignoring ' + msg.address + ': value is not a number')
				return
			}
			const pbFlash = Math.trunc(pbFlashVal)
			this.playbacks[pbId].flash = pbFlash
			this.setTrackedVariables({
				['pb' + pbId + '_flash']: pbFlash,
			})
			this.checkFeedbacks('pbFlash')
		} else if (execRegex.test(msg.address)) {
			const match = msg.address.match(execRegex)
			const target = this.parseExecTarget(match[1], match[2])
			if (target === undefined) {
				// debug, not warn: with OSC forwarding on, this socket also carries
				// traffic from other senders, and an unrelated /exec/ address would
				// otherwise fill the log of a connection that is working fine. The
				// playback branch ignores out-of-range addresses the same way.
				this.log(
					'debug',
					'Ignoring ' + msg.address + ': execute page must be 1-' + MAX_EXEC_PAGE + ' and number 1-' + MAX_EXEC_NR,
				)
				return
			}
			const execVal = this.oscNumber(msg)
			if (execVal === undefined) {
				this.log('debug', 'Ignoring ' + msg.address + ': value is not a number')
				return
			}
			const { execPage, execNr } = target
			const execValPercent = Math.round(execVal * 100)
			this.ensureExecVariable(execPage, execNr)
			this.setTrackedVariables({
				['exec' + execPage + '_' + execNr]: execValPercent,
			})
			// set the value in the execs array
			this.execs[execPage][execNr] = execValPercent
			this.checkFeedbacks('exec')
		}
	}

	// With feedback on, ask the console again whenever it has gone quiet, so a
	// console that restarted - and forgot the subscription - starts sending
	// again on its own. Only warn while nothing has ever been received: MagicQ
	// sends on change, so silence from a console that has replied is normal and
	// must not turn the connection yellow mid-show.
	restartFeedbackTimer() {
		this.stopFeedbackTimer()
		this.feedbackTimer = setTimeout(() => {
			this.feedbackTimer = null
			if (!this.consoleSeen) {
				this.setStatus(
					InstanceStatus.UnknownWarning,
					'No OSC received from console - check the OSC TX IP and port on MagicQ',
				)
			}
			this.sendOSC('/feedback/pb+exec')
			this.restartFeedbackTimer()
		}, FEEDBACK_TIMEOUT_MS)
	}

	stopFeedbackTimer() {
		if (this.feedbackTimer) {
			clearTimeout(this.feedbackTimer)
			this.feedbackTimer = null
		}
	}

	closeOSC() {
		this.stopFeedbackTimer()
		this.stopReconnect()
		for (const port of [this.osc, this.companionOsc]) {
			if (!port) {
				continue
			}
			try {
				// Detach before closing. A port can still report an error while it
				// is going away, and its handlers close over this instance - so a
				// socket being replaced could otherwise fail the connection that
				// replaced it, or schedule a retry after destroy().
				port.removeAllListeners()
				// osc.js forwards the dgram socket's errors onto the port, and that
				// forwarder is attached to the socket, so the detach above cannot
				// remove it. An 'error' with no listener throws, and these arrive
				// from async socket callbacks where nothing would catch it.
				port.on('error', () => {})
				port.close()
			} catch (err) {
				this.log('debug', 'Error closing OSC port: ' + err)
			}
		}
		this.osc = null
		this.companionOsc = null
	}

	setupOSC() {
		this.closeOSC()
		// new sockets, new config: nothing has been heard on them yet
		this.consoleSeen = false
		this.forwardingFailed = false

		const remotePort = this.parsePort(this.config.port)
		if (!this.config.host || remotePort === undefined) {
			this.setStatus(InstanceStatus.BadConfig, 'Target IP and port must be set')
			return
		}

		const feedbackEnabled = this.feedbackEnabled()
		const forwardOSC = !!this.config.forwardOSC
		// Forwarding relays what the console sends, so it needs the listening
		// socket too, whether or not feedback is enabled.
		const listen = feedbackEnabled || forwardOSC
		const rxPort = this.parsePort(this.config.rxPort)
		if (listen && rxPort === undefined) {
			this.setStatus(InstanceStatus.BadConfig, 'Feedback port must be set when feedback or forwarding is enabled')
			return
		}

		this.setStatus(InstanceStatus.Connecting)

		// Open the forwarding socket first, so it is ready before the first
		// message can arrive on the socket below.
		if (forwardOSC) {
			const forwardPort = this.parsePort(this.config.forwardPort)
			if (forwardPort === rxPort) {
				// Forwarding to the port we listen on feeds every packet straight
				// back in, and each pass forwards it again.
				this.setStatus(
					InstanceStatus.BadConfig,
					'Companion OSC listen port must differ from the feedback port, or forwarded messages loop back',
				)
				return
			}
			if (forwardPort === undefined) {
				// Same treatment as a missing feedback port: a connection that
				// cannot do what its config asks must not sit there looking fine.
				this.setStatus(InstanceStatus.BadConfig, 'Companion OSC listen port must be set when forwarding is enabled')
				return
			}

			let forwardReady = false
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
				forwardReady = true
				this.log('debug', 'OSC forwarding ready on port ' + companionPort.socket.address().port)
			})
			// Without a listener an EADDRINUSE here would take down the whole module
			companionPort.on('error', (err) => {
				// osc.js reports a failed bind and a failed send through the same
				// event. A socket that never opened is unusable, so give it up and
				// say so; one that did open is seeing a blip - the far end may not
				// be listening yet - and must keep working, or forwarding would be
				// dead until the connection is rebuilt.
				if (forwardReady) {
					this.log('warn', 'OSC forwarding error: ' + err)
					return
				}

				this.log('error', 'OSC forwarding error: ' + err)
				this.forwardingFailed = true
				if (this.companionOsc === companionPort) {
					this.companionOsc = null
				}
				// Close it here: once the reference is dropped, closeOSC() can no
				// longer reach the socket and it would stay bound for good.
				try {
					companionPort.close()
				} catch (closeErr) {
					this.log('debug', 'Error closing OSC forwarding port: ' + closeErr)
				}
				this.reportReachable()
			})
			this.companionOsc = companionPort
			companionPort.open()
		}

		const oscPort = new osc.UDPPort({
			localAddress: '0.0.0.0',
			// Only claim the configured feedback port when the console is actually
			// transmitting to it. Otherwise nothing needs to reach us on a known
			// port, so bind 0 and let the OS pick a free one - otherwise every
			// instance would fight over the same port and fail with EADDRINUSE.
			localPort: listen ? rxPort : 0,
			remoteAddress: this.config.host,
			remotePort: remotePort,
		})

		let ready = false
		oscPort.on('ready', () => {
			ready = true
			this.log('debug', 'OSC ready on port ' + oscPort.socket.address().port)

			if (feedbackEnabled) {
				// Stay in Connecting until the console actually sends something back
				this.sendOSC('/feedback/pb+exec')
				this.restartFeedbackTimer()
			} else {
				// Send-only on a connectionless socket, so there is nothing to wait for
				this.reportReachable()
			}
		})
		oscPort.on('message', (msg) => {
			// Anything arriving on this socket counts as proof the console can
			// reach us: it is the port the user set aside for it. Matching the
			// sender against the Target IP looks stricter, but the console
			// legitimately replies from another address - MagicQ PC on this
			// machine sends from 127.0.0.1 while Target IP is the LAN address -
			// and the status would then contradict variables that are updating.
			if (feedbackEnabled) {
				this.consoleSeen = true
				this.reportReachable()
				// Keep the watchdog running: a console that restarts forgets the
				// feedback subscription, and only a re-request brings it back.
				this.restartFeedbackTimer()

				// a malformed message must never take the module down
				try {
					this.checkVariables(msg)
				} catch (err) {
					this.log('error', 'Error handling OSC message ' + msg.address + ': ' + err)
				}
			}

			// check if we need to forward the message to Companion
			if (this.companionOsc) {
				try {
					this.companionOsc.send({
						address: msg.address,
						args: msg.args,
					})
				} catch (err) {
					this.log('debug', 'Error forwarding OSC message ' + msg.address + ': ' + err)
				}
			}
		})
		oscPort.on('error', (err) => {
			// Only a socket that cannot be opened means the connection is down.
			// Undecodable packets and one-off send failures (a short network
			// blip) are logged, but must not leave the status red.
			if (!ready || err.syscall === 'bind') {
				this.log('error', 'OSC error: ' + err)
				this.setStatus(InstanceStatus.ConnectionFailure, err.message)
				this.scheduleReconnect()
			} else {
				this.log('warn', 'OSC error: ' + err)
			}
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
		try {
			this.osc.send({
				address: cmd,
				args: args,
			})
		} catch (err) {
			this.log('warn', 'Could not send OSC ' + cmd + ': ' + err)
		}
	}

	// Try to open the sockets again later, e.g. when the feedback port was
	// held by another program
	scheduleReconnect() {
		if (this.destroyed || this.reconnectTimer) {
			return
		}
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.log('info', 'Retrying OSC connection')
			try {
				this.setupOSC()
			} catch (err) {
				this.log('error', 'Error setting up OSC: ' + err)
				this.setStatus(InstanceStatus.UnknownError, String(err?.message ?? err))
			}
		}, RECONNECT_DELAY_MS)
	}

	stopReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}

	async destroy() {
		this.log('debug', 'destroy')
		// Mark it gone before tearing down, so nothing that runs during the close
		// can schedule more work.
		this.destroyed = true
		this.closeOSC()
	}

	async configUpdated(config) {
		await this.init(config)
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
				tooltip:
					'Listen for the levels the console sends back. Requires feedback to be enabled on the Chamsys console OSC settings. When off, feedbacks and variables only reflect what this connection has sent.',
				default: true,
				width: 6,
				// Referenced by the Feedback Port field's isVisibleExpression below,
				// which may only read fields that cannot become expressions.
				disableAutoExpression: true,
			},
			{
				type: 'textinput',
				id: 'rxPort',
				label: 'Feedback Port',
				tooltip: 'The OSC TX port of the Chamsys console. Used for feedback and for forwarding OSC to Companion.',
				default: '9000',
				width: 4,
				regex: Regex.PORT,
				isVisibleExpression: '$(options:enableFeedback) == true || $(options:forwardOSC) == true',
			},
			{
				type: 'checkbox',
				id: 'forwardOSC',
				label: 'Forward OSC messages to Companion',
				tooltip:
					'If checked, all OSC messages received from the Chamsys console will be forwarded to Companion at the port below, allowing MagicQ to control Companion with OSC Commands.',
				default: false,
				width: 6,
				// Referenced by the Feedback Port and Companion OSC Listen Port
				// isVisibleExpressions, which may only read non-expression fields.
				disableAutoExpression: true,
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
				isVisibleExpression: '$(options:forwardOSC) == true',
			},
		]
	}
}

export { UpgradeScripts }
