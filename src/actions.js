import { Regex } from '@companion-module/base'

import { MAX_EXEC_PAGE, MAX_EXEC_NR } from './constants.js'

export default function UpdateActions(self) {
	self.setActionDefinitions({
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
				const pbId = self.parsePlayback(action.options.pbId)
				const pbVal = self.parseOption(action.options.pbVal, 0, 100)
				if (pbId === undefined || pbVal === undefined) {
					self.log('warn', 'Set playback fader: playback must be 1-10 and level a number')
					return
				}

				const arg = {
					type: 'i',
					value: pbVal,
				}
				self.sendOSC('/pb/' + pbId, arg)
				// Track the value we just sent. MagicQ reports manual fader moves but
				// never its own OSC-driven changes, so without this the variable would
				// not move until the feedback watchdog's next dump, up to 10s later.
				//
				// That dump may then correct us by a percent: the console stores levels
				// in 255ths, so a sent 50 comes back as 129/255 and reads as 51.
				// Measured against a desk, and the lesser of two evils - dropping this
				// write to avoid the correction would leave the button stale for 10s.
				self.playbacks[pbId].value = pbVal
				self.setTrackedVariables({
					['pb' + pbId]: pbVal,
				})
				self.checkFeedbacks('pb')
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
				const pbId = self.parsePlayback(action.options.pbId)
				const pbVal = self.parseOption(action.options.pbVal, -100, 100)
				if (pbId === undefined || pbVal === undefined) {
					self.log('warn', 'Adjust playback level: playback must be 1-10 and amount a number')
					return
				}
				// get the current value of the playback
				let pbNewLevel = self.playbacks[pbId].value + pbVal
				// check if the new level is greater than 100 or less than 0
				if (pbNewLevel > 100) {
					pbNewLevel = 100
				} else if (pbNewLevel < 0) {
					pbNewLevel = 0
				}

				const arg = {
					type: 'i',
					value: pbNewLevel,
				}
				self.sendOSC('/pb/' + pbId, arg)
				// set the value in the playbacks array since magicQ does not send feedback for OSC commands
				self.playbacks[pbId].value = pbNewLevel
				self.setTrackedVariables({
					['pb' + pbId]: pbNewLevel,
				})
				self.checkFeedbacks('pb')
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
				const pbId = self.parsePlayback(action.options.pbId)
				if (pbId === undefined) {
					self.log('warn', 'Go on playback: playback must be a whole number from 1 to 10')
					return
				}
				self.sendOSC('/pb/' + pbId + '/go')
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
					disableAutoExpression: true,
					default: '1',
				},
			],
			callback: async (action) => {
				const pbId = self.parsePlayback(action.options.pbId)
				let flashVal = self.parseOption(action.options.pbFId, 0, 2)
				if (flashVal === undefined) {
					self.log('warn', 'Flash playback: action must be a number')
					return
				}
				if (pbId === undefined) {
					self.log('warn', 'Flash playback: playback must be a whole number from 1 to 10')
					return
				}

				// handle toggle
				if (flashVal === 2) {
					flashVal = self.playbacks[pbId].flash === 1 ? 0 : 1
				}
				const arg = {
					type: 'i',
					value: flashVal,
				}
				self.sendOSC('/pb/' + pbId + '/flash', arg)
				// set the value in the playbacks array since magicQ does not send feedback for OSC commands
				// store the resolved value, not the dropdown id, so toggle and the feedback agree
				self.playbacks[pbId].flash = flashVal
				self.setTrackedVariables({
					['pb' + pbId + '_flash']: flashVal,
				})
				self.checkFeedbacks('pbFlash')
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
				const pbId = self.parsePlayback(action.options.pbId)
				if (pbId === undefined) {
					self.log('warn', 'Pause playback: playback must be a whole number from 1 to 10')
					return
				}
				self.sendOSC('/pb/' + pbId + '/pause')
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
				const pbId = self.parsePlayback(action.options.pbId)
				if (pbId === undefined) {
					self.log('warn', 'Release playback: playback must be a whole number from 1 to 10')
					return
				}
				self.sendOSC('/pb/' + pbId + '/release')
				// Release deactivates the playback but leaves its fader alone: measured
				// against a desk, /pb/N/release changes neither the reported level nor
				// the flash state. So only track it here when the console is not
				// reporting - with feedback on, the next dump would overwrite this zero
				// with the fader's real level a moment later and the button would light
				// again. With feedback off nothing can correct us, and without this
				// every button watching that playback stays lit after it was released.
				if (!self.feedbackEnabled()) {
					self.playbacks[pbId].value = 0
					self.setTrackedVariables({
						['pb' + pbId]: 0,
					})
					self.checkFeedbacks('pb')
				}
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
				const pbId = self.parsePlayback(action.options.pbId)
				const cue = self.parseFloatOption(action.options.cue)
				if (pbId === undefined || cue === undefined) {
					self.log('warn', 'Jump to cue: playback must be 1-10 and cue number a number')
					return
				}
				self.sendOSC('/pb/' + pbId + '/' + cue)
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
					disableAutoExpression: true,
					default: '1',
				},
			],
			callback: async (action) => {
				let dboVal = self.parseOption(action.options.dboId, 0, 2)
				if (dboVal === undefined) {
					self.log('warn', 'Desk black out: action must be a number')
					return
				}
				// handle toggle
				if (dboVal === 2) {
					dboVal = self.dbo === 1 ? 0 : 1
				}
				const arg = {
					type: 'i',
					value: dboVal,
				}
				self.sendOSC('/dbo', arg)
				// magicQ does not send feedback for OSC commands, so track the
				// resolved state here for the next toggle and for the feedback
				self.dbo = dboVal
				self.checkFeedbacks('dbo')
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
					disableAutoExpression: true,
					default: '0',
				},
			],
			callback: (action) => {
				const swapVal = self.parseOption(action.options.swapId, 0, 1)
				if (swapVal === undefined) {
					self.log('warn', 'Set swap mode: mode must be a number')
					return
				}
				const arg = {
					type: 'i',
					value: swapVal,
				}
				self.sendOSC('/swap', arg)
			},
		},

		execute: {
			name: 'Execute',
			options: [
				{
					type: 'textinput',
					label: `Execute Page (1-${MAX_EXEC_PAGE})`,
					id: 'exeP',
					default: '1',
					regex: Regex.NUMBER,
					useVariables: true,
				},
				{
					type: 'textinput',
					label: `Execute Nr (1-${MAX_EXEC_NR})`,
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
					disableAutoExpression: true,
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
				const target = self.parseExecTarget(action.options.exeP, action.options.exeNr)
				if (target === undefined) {
					self.log('warn', `Execute: page must be 1-${MAX_EXEC_PAGE} and number 1-${MAX_EXEC_NR}`)
					return
				}
				const { execPage: exeP, execNr: exeNr } = target
				const exeToggle = !!action.options.exeToggle
				let exeVal
				if (exeToggle) {
					// the level field is hidden in toggle mode, so it is not checked
					exeVal = self.execLevel(exeP, exeNr) > 0 ? 0 : 100
				} else {
					exeVal = self.parseOption(action.options.exeVal, 0, 100)
					if (exeVal === undefined) {
						self.log('warn', 'Execute: level must be a number')
						return
					}
				}
				// magicQ does not send feedback for OSC commands, so this module
				// tracks the state itself - make sure there is somewhere to put it
				self.ensureExecVariable(exeP, exeNr)
				const arg = {
					type: 'f',
					value: exeVal / 100,
				}
				self.sendOSC('/exec/' + exeP + '/' + exeNr, arg)
				self.setTrackedVariables({
					['exec' + exeP + '_' + exeNr]: exeVal,
				})
				self.execs[exeP][exeNr] = exeVal
				self.checkFeedbacks('exec')
			},
		},

		executeAdjust: {
			name: 'Adjust Execute Level',
			options: [
				{
					type: 'textinput',
					label: `Execute Page (1-${MAX_EXEC_PAGE})`,
					id: 'exeP',
					default: '1',
					regex: Regex.NUMBER,
					useVariables: true,
				},
				{
					type: 'textinput',
					label: `Execute Number (1-${MAX_EXEC_NR})`,
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
				const target = self.parseExecTarget(action.options.exeP, action.options.exeNr)
				const exeVal = self.parseOption(action.options.exeVal, -100, 100)
				if (target === undefined || exeVal === undefined) {
					self.log(
						'warn',
						`Adjust execute level: page must be 1-${MAX_EXEC_PAGE}, number 1-${MAX_EXEC_NR} and amount a number`,
					)
					return
				}
				const { execPage: exeP, execNr: exeNr } = target
				// check if we have a current value of the execute
				self.ensureExecVariable(exeP, exeNr)
				if (self.execs[exeP][exeNr] === undefined) {
					self.execs[exeP][exeNr] = 0
				}
				// get the current value of the playback
				let exeNewLevel = self.execs[exeP][exeNr] + exeVal
				// check if the new level is greater than 100 or less than 0
				if (exeNewLevel > 100) {
					exeNewLevel = 100
				} else if (exeNewLevel < 0) {
					exeNewLevel = 0
				}

				const arg = {
					type: 'f',
					value: exeNewLevel / 100,
				}
				self.sendOSC('/exec/' + exeP + '/' + exeNr, arg)
				self.setTrackedVariables({
					['exec' + exeP + '_' + exeNr]: exeNewLevel,
				})
				self.execs[exeP][exeNr] = exeNewLevel
				self.checkFeedbacks('exec')
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
				const tenSceneItem = self.parseOption(action.options.tenSceneItem)
				const tenSceneZone = self.parseOption(action.options.tenSceneZone)
				const tenSceneVal = self.parseFloatOption(action.options.tenSceneVal, 0, 1)
				if (tenSceneItem === undefined || tenSceneZone === undefined || tenSceneVal === undefined) {
					self.log('warn', '10Scene: item, zone and level must all be numbers')
					return
				}

				const arg = {
					type: 'f',
					value: tenSceneVal,
				}
				self.sendOSC('/10scene/' + tenSceneItem + '/' + tenSceneZone, arg)
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
				const rpcCmd = String(action.options.rpcCmd ?? '').trim()
				if (rpcCmd === '') {
					self.log('warn', 'RPC Command: command is empty, nothing sent')
					return
				}

				const arg = {
					type: 's',
					value: rpcCmd,
				}
				self.sendOSC('/rpc', arg)
			},
		},
	})
}
