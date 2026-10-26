export default function UpdateVariableDefinitions(self) {
	self.variables = {}

	for (let i = 1; i <= 10; i++) {
		self.variables['pb' + i] = { name: 'Playback ' + i + ' Level' }

		self.variables['pb' + i + '_flash'] = { name: 'Playback ' + i + ' Flash' }
	}

	// Execute variables are created as executes are seen, so add back every
	// one already known - otherwise saving the config would drop them.
	self.execs.forEach((page, execPage) => {
		page?.forEach((value, execNr) => {
			if (value !== undefined) {
				self.variables['exec' + execPage + '_' + execNr] = { name: 'Execute Page ' + execPage + ', Exec ' + execNr }
			}
		})
	})

	self.setVariableDefinitions(self.variables)
	self.setVariableValues(self.trackedVariableValues())
}
