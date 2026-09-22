import { Regex } from '@companion-module/base'

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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				const pbVal = self.parseOption(action.options.pbVal, 0, 100)
				if (pbId === undefined || pbVal === undefined) {
					self.log('warn', 'Set playback fader: playback and level must both be numbers')
					return
				}

				const arg = {
					type: 'i',
					value: pbVal,
				}
				self.sendOSC('/pb/' + pbId, arg)
				// set the value in the playbacks array since magicQ does not send feedback for OSC commands
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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				const pbVal = self.parseOption(action.options.pbVal, -100, 100)
				if (pbId === undefined || pbVal === undefined) {
					self.log('warn', 'Adjust playback level: playback and amount must both be numbers')
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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				if (pbId === undefined) {
					self.log('warn', 'Go on playback: playback must be a number')
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
					default: '1',
				},
			],
			callback: async (action) => {
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				let flashVal = self.parseOption(action.options.pbFId, 0, 2)
				if (flashVal === undefined) {
					self.log('warn', 'Flash playback: action must be a number')
					return
				}
				if (pbId === undefined) {
					self.log('warn', 'Flash playback: playback must be a number')
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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				if (pbId === undefined) {
					self.log('warn', 'Pause playback: playback must be a number')
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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				if (pbId === undefined) {
					self.log('warn', 'Release playback: playback must be a number')
					return
				}
				self.sendOSC('/pb/' + pbId + '/release')
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
				const pbId = self.parseOption(action.options.pbId, 1, 10)
				const cue = self.parseFloatOption(action.options.cue)
				if (pbId === undefined || cue === undefined) {
					self.log('warn', 'Jump to cue: playback and cue number must both be numbers')
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
				// resolved state here for the next toggle
				self.dbo = dboVal
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
				const exeP = self.parseOption(action.options.exeP)
				const exeNr = self.parseOption(action.options.exeNr)
				let exeVal = self.parseOption(action.options.exeVal, 0, 100)
				if (exeP === undefined || exeNr === undefined || exeVal === undefined) {
					self.log('warn', 'Execute: page, number and level must all be numbers')
					return
				}
				const exeToggle = action.options.exeToggle
				// magicQ does not send feedback for OSC commands, so this module
				// tracks the state itself - make sure there is somewhere to put it
				self.ensureExecVariable(exeP, exeNr)
				// handle toggle
				if (exeToggle) {
					if (self.execs[exeP][exeNr] === undefined) {
						exeVal = 100
					} else {
						exeVal = self.execs[exeP][exeNr] > 0 ? 0 : 100
					}
				}
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
				const exeP = self.parseOption(action.options.exeP, 1, 10)
				const exeNr = self.parseOption(action.options.exeNr, 1, 100)
				const exeVal = self.parseOption(action.options.exeVal, -100, 100)
				if (exeP === undefined || exeNr === undefined || exeVal === undefined) {
					self.log('warn', 'Adjust execute level: page, number and amount must all be numbers')
					return
				}
				// check if we have a current value of the execute
				self.ensureExecVariable(exeP, exeNr)
				if (self.execs[exeP][exeNr] === undefined) {
					self.execs[exeP][exeNr] = 0
				}
				// get the current value of the playback
				let exeNewLevel = self.execs[exeP][exeNr] + parseInt(exeVal)
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
				const rpcCmd = action.options.rpcCmd

				const arg = {
					type: 's',
					value: rpcCmd,
				}
				self.sendOSC('/rpc', arg)
			},
		},
	})
}
