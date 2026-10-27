import { Regex, combineRgb } from '@companion-module/base'

export default function UpdateFeedbacks(self) {
	self.setFeedbackDefinitions({
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
					disableAutoExpression: true,
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
				const pbId = self.parsePlayback(feedback.options.pbId)
				const pbVal = self.parseOption(feedback.options.pbVal, 0, 100)
				const pbComp = feedback.options.pbComp
				if (pbId === undefined || (pbComp !== 'isActive' && pbVal === undefined)) {
					return false
				}
				const pbLevel = self.playbacks[pbId].value

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
				const pbId = self.parsePlayback(feedback.options.pbId)
				if (pbId === undefined) {
					return false
				}
				return self.playbacks[pbId].flash === 1
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
					disableAutoExpression: true,
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
				const target = self.parseExecTarget(feedback.options.execPage, feedback.options.execNumber)
				const execVal = self.parseOption(feedback.options.execVal, 0, 100)
				const execComp = feedback.options.execComp
				if (target === undefined || (execComp !== 'isActive' && execVal === undefined)) {
					return false
				}
				// An execute nobody has touched yet has no stored level. Treat it as
				// 0, the way playbacks are seeded in the constructor: otherwise
				// "Not Equal 0" is true for every unused execute (undefined !== 0),
				// and "Less than" stays false for one that really is at 0.
				const execLevel = self.execLevel(target.execPage, target.execNr) ?? 0

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
		dbo: {
			type: 'boolean',
			name: 'Desk Black Out',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				// the same orange the black out presets use
				bgcolor: combineRgb(204, 102, 0),
			},
			description:
				'True while this connection has desk black out on. MagicQ does not report DBO back over OSC, so this follows what Companion last sent, not the desk.',
			// MagicQ does not report DBO back over OSC, so this reflects what this
			// connection last sent - the same basis the DBO toggle already uses.
			options: [],
			callback: () => self.dbo === 1,
		},
	})
}
