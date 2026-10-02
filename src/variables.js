export default function UpdateVariableDefinitions(self) {
	self.variables = {}

	if (self.feedbackEnabled()) {
		for (let i = 1; i <= 10; i++) {
			self.variables['pb' + i] = { name: 'Playback ' + i + ' Level' }

			self.variables['pb' + i + '_flash'] = { name: 'Playback ' + i + ' Flash' }
		}
	}

	// Always publish, so turning feedback off clears any previously
	// registered variables rather than leaving them behind stale.
	self.setVariableDefinitions(self.variables)
}
