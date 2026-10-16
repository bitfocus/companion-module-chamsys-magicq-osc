**Chamsys MagicQ**

Go to [Chamsys](https://secure.chamsys.co.uk/magicq) to get more information about the diffrent consoles

We currently support the following actions, feedbacks and variables:

## Configuration

| Setting                           | What it does                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target IP / Target Port           | The IP of the console and its OSC RX port                                                                                                                                   |
| Enable Feedback                   | Listen for the playback and execute levels the console sends back. When off, feedbacks and variables still work, but only reflect what this connection has sent the console |
| Feedback Port                     | The OSC TX port of the console. Needed when feedback or OSC forwarding is enabled                                                                                           |
| Forward OSC messages to Companion | Forward every OSC message received from the console to Companion's own OSC listen port, so MagicQ can control Companion                                                     |

On MagicQ, set the OSC TX IP to the IP of the machine running Companion for feedback and forwarding to work. If the connection shows a warning that no OSC was received, check the OSC TX IP and port on the console.

## Actions

| Action                       | What it does                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Set the playback fader level | Sets the playback fader level by the given value 0 - 100 %                                                 |
| Adjust Playback level        | Adjusts the playback fader level by the given value 0 - 100 %                                              |
| Go on Playback               | Advance the cue list on the playback given, as you would by pressing the go button on the console Playback |
| Flash playback               | Turn on, turn off, or toggle the flash button                                                              |
| Pause Playback               | Pauses the running cue / cuelist on the given playback                                                     |
| Release Playback             | Releases the cue / cuelist on the given playback                                                           |
| Playback jump to cue         | Jumps to the given cue on the given playback                                                               |
| Desk Black Out               | Turn on, turn off, or toggle DBO                                                                           |
| Set Swap Mode                | Sets the swap mode to add or swap                                                                          |
| Execute                      | Control or toggle Execute buttons / faders                                                                 |
| Adjust Execute level         | Adjusts the execute fader level by the given value 0 - 100 %                                               |
| 10 Scene                     | Control 10Scene buttons / faders                                                                           |
| RPC Command                  | Send a RPC command to the console                                                                          |

## Feedbacks

| Feedback       | What it does                                                       |
| -------------- | ------------------------------------------------------------------ |
| Playback Level | Set feedback based on the playback fader level (0 - 100%)          |
| Playback Flash | Set feedback based on the playback flash button (on/off)           |
| Execute Level  | Set feedback based on the execute fader or button level (0 - 100%) |

## Variables

- Playback Level
- Playback Flash
- Execute Level
