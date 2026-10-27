import { combineRgb } from '@companion-module/base'

import { MAX_EXEC_PAGE } from './constants.js'

// Button text can show this connection's own variables. Companion rewrites the
// prefix to the connection's label when the preset is dropped, so the module's
// shortname stands in for it here.
const VARIABLE_PREFIX = 'magicq'

// MagicQ's OSC spec addresses playbacks 1-10. Executes have no fixed limit, so
// the preset list offers a usable first page and the page is left editable on
// the button rather than generating every combination.
const PLAYBACK_COUNT = 10
const EXECUTE_COUNT = 12

const TEXT = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const BACKGROUND = combineRgb(0, 0, 0)
const ACTIVE = combineRgb(0, 153, 0)
const FLASHING = combineRgb(204, 0, 0)
const BLACKOUT = combineRgb(204, 102, 0)

function style(text, size = '14') {
	return { text, size, color: TEXT, bgcolor: BACKGROUND }
}

// The local variable a template group varies, and the expression that reads it.
const PLAYBACK_LOCAL = { variableType: 'simple', variableName: 'playback', startupValue: 1 }
const PLAYBACK = { isExpression: true, value: '$(local:playback)' }

const EXECUTE_LOCALS = [
	{ variableType: 'simple', variableName: 'exec', startupValue: 1 },
	// Left editable on the button: a template group can only vary one variable,
	// and the page is the one an operator is most likely to want to change.
	{ variableType: 'simple', variableName: 'page', startupValue: 1 },
]
const EXECUTE = { isExpression: true, value: '$(local:exec)' }
const EXECUTE_PAGE = { isExpression: true, value: '$(local:page)' }

// Lights the button while the desk is blacked out.
function blackoutFeedback() {
	return {
		feedbackId: 'dbo',
		options: {},
		style: { bgcolor: BLACKOUT, color: BLACK },
	}
}

// Lights the button while the playback is above zero.
function playbackActiveFeedback() {
	return {
		feedbackId: 'pb',
		options: { pbId: PLAYBACK, pbComp: 'isActive', pbVal: '0' },
		style: { bgcolor: ACTIVE, color: TEXT },
	}
}

function templateValues(count, label) {
	return Array.from({ length: count }, (_, i) => ({ name: `${label} ${i + 1}`, value: i + 1 }))
}

export default function UpdatePresets(self) {
	const presets = {}

	// --- Playbacks, one definition each rendered once per playback ------------

	presets['playback_go'] = {
		type: 'simple',
		name: 'Go on playback',
		keywords: ['go', 'cue', 'next'],
		style: style('PB $(local:playback)\\nGO'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [{ down: [{ actionId: 'pbGo', options: { pbId: PLAYBACK } }], up: [] }],
		feedbacks: [playbackActiveFeedback()],
	}

	presets['playback_flash'] = {
		type: 'simple',
		name: 'Flash playback while held',
		keywords: ['flash', 'bump', 'momentary'],
		style: style('PB $(local:playback)\\nFLASH'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [
			{
				// Flash on while the button is held, off when it is let go, which is
				// what the flash button on the desk does.
				down: [{ actionId: 'pbFlash', options: { pbId: PLAYBACK, pbFId: '1' } }],
				up: [{ actionId: 'pbFlash', options: { pbId: PLAYBACK, pbFId: '0' } }],
			},
		],
		feedbacks: [
			{
				feedbackId: 'pbFlash',
				options: { pbId: PLAYBACK },
				style: { bgcolor: FLASHING, color: TEXT },
			},
		],
	}

	presets['playback_full'] = {
		type: 'simple',
		name: 'Playback fader to full',
		keywords: ['fader', '100', 'full', 'on'],
		style: style('PB $(local:playback)\\nFULL'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [{ down: [{ actionId: 'pb', options: { pbId: PLAYBACK, pbVal: '100' } }], up: [] }],
		feedbacks: [playbackActiveFeedback()],
	}

	presets['playback_zero'] = {
		type: 'simple',
		name: 'Playback fader to zero',
		keywords: ['fader', '0', 'zero', 'off'],
		style: style('PB $(local:playback)\\nZERO'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [{ down: [{ actionId: 'pb', options: { pbId: PLAYBACK, pbVal: '0' } }], up: [] }],
		feedbacks: [playbackActiveFeedback()],
	}

	presets['playback_release'] = {
		type: 'simple',
		name: 'Release playback',
		keywords: ['release', 'clear'],
		style: style('PB $(local:playback)\\nREL'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [{ down: [{ actionId: 'pbRelease', options: { pbId: PLAYBACK } }], up: [] }],
		feedbacks: [playbackActiveFeedback()],
	}

	presets['playback_pause'] = {
		type: 'simple',
		name: 'Pause playback',
		keywords: ['pause', 'hold'],
		style: style('PB $(local:playback)\\nPAUSE'),
		localVariables: [PLAYBACK_LOCAL],
		steps: [{ down: [{ actionId: 'pbPause', options: { pbId: PLAYBACK } }], up: [] }],
		feedbacks: [playbackActiveFeedback()],
	}

	// --- Playback levels ------------------------------------------------------
	// One preset per playback rather than a template group: the button shows that
	// playback's level, and a variable name cannot be built from a local variable.

	const levelPresetIds = []
	for (let pbId = 1; pbId <= PLAYBACK_COUNT; pbId++) {
		const id = `playback_level_${pbId}`
		levelPresetIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Playback ${pbId} level`,
			keywords: ['level', 'fader', 'readout'],
			style: style(`PB ${pbId}\\n$(${VARIABLE_PREFIX}:pb${pbId})%`),
			// A readout, with no action: the name, the keywords and the face all
			// say meter, so a press must not move the fader. "Fader to full"
			// covers that job for every playback.
			steps: [{ down: [], up: [] }],
			feedbacks: [
				{
					feedbackId: 'pb',
					options: { pbId: String(pbId), pbComp: 'isActive', pbVal: '0' },
					style: { bgcolor: ACTIVE, color: TEXT },
				},
			],
		}
	}

	// --- Executes -------------------------------------------------------------

	presets['execute_toggle'] = {
		type: 'simple',
		name: 'Toggle execute',
		keywords: ['execute', 'toggle', 'exec'],
		style: style('EX $(local:page)/$(local:exec)', 'auto'),
		localVariables: EXECUTE_LOCALS,
		steps: [
			{
				down: [
					{
						actionId: 'execute',
						// In toggle mode the level is ignored, but every option in the
						// action's definition still has to be given - and 100 is the
						// sane value if someone unticks Toggle on the button.
						options: { exeP: EXECUTE_PAGE, exeNr: EXECUTE, exeToggle: true, exeVal: '100' },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'exec',
				options: { execPage: EXECUTE_PAGE, execNumber: EXECUTE, execComp: 'isActive', execVal: '0' },
				style: { bgcolor: ACTIVE, color: TEXT },
			},
		],
	}

	presets['execute_full'] = {
		type: 'simple',
		name: 'Execute to full',
		keywords: ['execute', 'exec', '100'],
		style: style('EX $(local:page)/$(local:exec)\\nFULL', 'auto'),
		localVariables: EXECUTE_LOCALS,
		steps: [
			{
				down: [
					{
						actionId: 'execute',
						options: { exeP: EXECUTE_PAGE, exeNr: EXECUTE, exeToggle: false, exeVal: '100' },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'exec',
				options: { execPage: EXECUTE_PAGE, execNumber: EXECUTE, execComp: 'isActive', execVal: '0' },
				style: { bgcolor: ACTIVE, color: TEXT },
			},
		],
	}

	presets['execute_release'] = {
		type: 'simple',
		name: 'Release execute',
		keywords: ['execute', 'exec', 'release', '0'],
		style: style('EX $(local:page)/$(local:exec)\\nREL', 'auto'),
		localVariables: EXECUTE_LOCALS,
		steps: [
			{
				down: [
					{
						actionId: 'execute',
						options: { exeP: EXECUTE_PAGE, exeNr: EXECUTE, exeToggle: false, exeVal: '0' },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'exec',
				options: { execPage: EXECUTE_PAGE, execNumber: EXECUTE, execComp: 'isActive', execVal: '0' },
				style: { bgcolor: ACTIVE, color: TEXT },
			},
		],
	}

	// --- Desk -----------------------------------------------------------------

	presets['dbo_toggle'] = {
		type: 'simple',
		name: 'Desk black out - toggle',
		keywords: ['dbo', 'blackout', 'black out'],
		style: style('DBO', 'auto'),
		steps: [{ down: [{ actionId: 'dbo', options: { dboId: '2' } }], up: [] }],
		feedbacks: [blackoutFeedback()],
	}

	presets['dbo_on'] = {
		type: 'simple',
		name: 'Desk black out - on',
		keywords: ['dbo', 'blackout', 'black out'],
		style: style('DBO\\nON', 'auto'),
		steps: [{ down: [{ actionId: 'dbo', options: { dboId: '1' } }], up: [] }],
		feedbacks: [blackoutFeedback()],
	}

	presets['dbo_off'] = {
		type: 'simple',
		name: 'Desk black out - off',
		keywords: ['dbo', 'blackout', 'black out'],
		style: style('DBO\\nOFF', 'auto'),
		steps: [{ down: [{ actionId: 'dbo', options: { dboId: '0' } }], up: [] }],
		feedbacks: [blackoutFeedback()],
	}

	presets['swap_add'] = {
		type: 'simple',
		name: 'Swap mode - add',
		keywords: ['swap', 'add', 'mode'],
		style: style('ADD', 'auto'),
		steps: [{ down: [{ actionId: 'swap', options: { swapId: '0' } }], up: [] }],
		feedbacks: [],
	}

	presets['swap_swap'] = {
		type: 'simple',
		name: 'Swap mode - swap',
		keywords: ['swap', 'mode'],
		style: style('SWAP', 'auto'),
		steps: [{ down: [{ actionId: 'swap', options: { swapId: '1' } }], up: [] }],
		feedbacks: [],
	}

	// --- Structure ------------------------------------------------------------

	const playbackValues = templateValues(PLAYBACK_COUNT, 'Playback')
	const executeValues = templateValues(EXECUTE_COUNT, 'Execute')

	const structure = [
		{
			id: 'playbacks',
			name: 'Playbacks',
			description:
				'Playback faders 1-10. Each button lights while its playback is above zero - as reported by the console when Enable Feedback is on, and as sent by this connection when it is off.',
			definitions: [
				{
					id: 'playback_levels',
					type: 'simple',
					name: 'Levels',
					description: 'Shows the current level of each playback. These buttons do not send anything.',
					presets: levelPresetIds,
				},
				{
					id: 'playback_go_group',
					type: 'template',
					name: 'Go',
					presetId: 'playback_go',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
				{
					id: 'playback_flash_group',
					type: 'template',
					name: 'Flash',
					presetId: 'playback_flash',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
				{
					id: 'playback_full_group',
					type: 'template',
					name: 'Fader to full',
					presetId: 'playback_full',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
				{
					id: 'playback_zero_group',
					type: 'template',
					name: 'Fader to zero',
					presetId: 'playback_zero',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
				{
					id: 'playback_release_group',
					type: 'template',
					name: 'Release',
					presetId: 'playback_release',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
				{
					id: 'playback_pause_group',
					type: 'template',
					name: 'Pause',
					presetId: 'playback_pause',
					templateVariableName: 'playback',
					templateValues: playbackValues,
				},
			],
		},
		{
			id: 'executes',
			name: 'Executes',
			description: `Executes 1-${EXECUTE_COUNT} on page 1. For another page, change the button's page local variable - a whole number from 1 to ${MAX_EXEC_PAGE}.`,
			definitions: [
				{
					id: 'execute_toggle_group',
					type: 'template',
					name: 'Toggle',
					presetId: 'execute_toggle',
					templateVariableName: 'exec',
					templateValues: executeValues,
				},
				{
					id: 'execute_full_group',
					type: 'template',
					name: 'To full',
					presetId: 'execute_full',
					templateVariableName: 'exec',
					templateValues: executeValues,
				},
				{
					id: 'execute_release_group',
					type: 'template',
					name: 'Release',
					presetId: 'execute_release',
					templateVariableName: 'exec',
					templateValues: executeValues,
				},
			],
		},
		{
			id: 'desk',
			name: 'Desk',
			description:
				"Desk black out and swap mode. All three black out buttons light while this connection has black out on - MagicQ does not report the desk's own DBO state back over OSC.",
			definitions: ['dbo_toggle', 'dbo_on', 'dbo_off', 'swap_add', 'swap_swap'],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
