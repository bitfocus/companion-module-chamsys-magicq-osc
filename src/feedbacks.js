import { Regex, combineRgb } from '@companion-module/base'

export default function UpdateFeedbacks(self) {
	if (!self.feedbackEnabled()) {
		// Publish an empty set, so turning feedback off clears any
		// previously registered feedbacks rather than leaving them behind.
		self.setFeedbackDefinitions({})
		return
	}

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
				const pbId = self.parseOption(feedback.options.pbId, 1, 10)
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
				const pbId = self.parseOption(feedback.options.pbId, 1, 10)
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
				const execPage = self.parseOption(feedback.options.execPage, 1, 10)
				const execNumber = self.parseOption(feedback.options.execNumber)
				const execVal = self.parseOption(feedback.options.execVal, 0, 100)
				const execComp = feedback.options.execComp
				if (execPage === undefined || execNumber === undefined || (execComp !== 'isActive' && execVal === undefined)) {
					return false
				}
				const execLevel = self.execs[execPage][execNumber]

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
