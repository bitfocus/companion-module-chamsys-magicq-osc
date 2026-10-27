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

On MagicQ, set the OSC TX IP to the IP of the machine running Companion for feedback and forwarding to work. If the connection shows a warning that no OSC was received, check the OSC TX IP and port on the console. The warning only appears before the console has replied for the first time - once it has, silence is normal, because MagicQ only sends when something changes.

### Notes for upgrading

- **OSC forwarding no longer depends on Enable Feedback.** It was tied to it in 3.2.0 and 3.2.1 only; this restores how 3.1.1 and earlier behaved. If a connection has forwarding ticked but feedback off, it will start forwarding again after the upgrade and will listen on the Feedback Port. Untick "Forward OSC messages to Companion" if you do not want that - the checkbox is now always visible.
- **Fixed-choice fields no longer offer expression mode.** The Action dropdowns on Flash Playback and Desk Black Out, Swap Mode on Set swap mode, Toggle? on Execute, and Comparison method on the Playback Level and Execute Level feedbacks are now plain choices. Their stored values were bare numbers that nothing in the editor explained, so expressions on them were a trap. If you had set an expression on one of these, pick the choice you want again.

## Actions

| Action                       | What it does                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Set the playback fader level | Sets the playback fader level by the given value 0 - 100 %                                                 |
| Adjust Playback level        | Adjusts the playback fader level by the given value 0 - 100 %                                              |
| Go on Playback               | Advance the cue list on the playback given, as you would by pressing the go button on the console Playback |
| Flash playback               | Turn on, turn off, or toggle the flash button                                                              |
| Pause Playback               | Pauses the running cue / cuelist on the given playback                                                     |
| Release Playback             | Releases the cue / cuelist on the given playback. See Levels and scaling below for what the variable does  |
| Playback jump to cue         | Jumps to the given cue on the given playback                                                               |
| Desk Black Out               | Presses the console's DBO button. What that does depends on the desk - see Desk black out below            |
| Set Swap Mode                | Sets the swap mode to add or swap                                                                          |
| Execute                      | Control or toggle Execute buttons / faders (page 1-10, number 1-1000)                                      |
| Adjust Execute level         | Adjusts the execute fader level by the given value 0 - 100 %                                               |
| 10 Scene                     | Control 10Scene buttons / faders                                                                           |
| RPC Command                  | Send a RPC command to the console                                                                          |

## Levels and scaling

These are measured against a real MagicQ, not assumed, and they explain a few things that
otherwise look like faults.

**The console reports levels in 255ths.** A playback at full arrives as `1.0039` (256/255),
slightly above the 0.0-1.0 you would expect. The module rounds to a percentage, so you still
see `100`.

**A level you set can read back one percent different.** Set a playback to 50 and the console
stores 129/255, which is 50.6%, so the variable settles at `51` within about ten seconds. The
module shows what you sent straight away because MagicQ does not report its own OSC-driven
changes; the correction arrives with the next feedback refresh. Nothing is wrong - the console
simply has a finer scale than whole percentages.

**Manual moves are reported immediately; OSC-driven ones are not.** Moving a fader on the desk
streams updates in real time. Changes made _by_ this module are never echoed back, which is why
the module tracks what it sends.

**Release does not lower the fader.** `Release` deactivates the playback, but its fader stays
where it is and the console keeps reporting that level. With **Enable Feedback** on, the level
variable therefore keeps showing the fader's real position, and a button watching it stays lit.
With feedback off there is nothing to report the truth, so the module sets the level variable to
0 itself.

## Desk black out

**The Desk Black Out action presses the console's DBO button. It does not set a black out
state.** What the press actually does is the desk's decision, not the module's: it follows the
**DBO Function** setting on the console, and the module has no way to read that setting or to
find out what happened afterwards.

Sending `1` is the press and `0` is the release. Measured against a desk:

| DBO Function    | What "Black Out On" (`1`) does                          | What "Black Out Off" (`0`) does                  |
| --------------- | ------------------------------------------------------- | ------------------------------------------------ |
| **Momentary**   | Blacks out, and stays out - OSC has no physical release | Releases it, so black out ends                   |
| **Latched**     | **Toggles** black out                                   | **Nothing** - there is no held button to release |
| **Tap to time** | **Taps the tempo.** No black out at all                 | Nothing                                          |

So the action's names only describe reality on a **momentary** DBO button, which is what this
module assumes. On anything else:

- On a **latched** button, _Black Out Off_ will not clear black out. Press _Black Out On_ a
  second time instead.
- On a **tap to time** button, none of these buttons black anything out - they tap tempo on a
  playback, and _Black Out Toggle_ taps on only every other press, because it alternates between
  `1` and `0` and only `1` taps.

In every case the **Desk Black Out** feedback shows what this connection last sent, not what the
desk did, because MagicQ never reports black out state over OSC. If the two can disagree on your
desk, don't rely on the feedback to tell you whether the rig is dark.

## Execute types

An execute's behaviour depends on how it is programmed on the console, and the module cannot
tell which type it is.

| Execute type | Setting it to 50% does this                                |
| ------------ | ---------------------------------------------------------- |
| Fader        | Goes to 50%, and reads back `50`                           |
| Button       | Turns fully on - any non-zero value does. Reads back `100` |
| Solo         | Turns fully on. Reads back `100`                           |
| Encoder      | Turns fully on. Reads back `100`                           |
| Flash        | Momentary - it does not latch, and reads back `0`          |

**Execute pages run 1-10.** MagicQ's built-in OSC addresses reach the first 10 execute grids
only; a higher page is simply ignored by the desk. Item numbers within a grid go much higher.

So the level on the **Execute** action is only meaningful for fader-type executes. For every
other type, treat any non-zero value as "on".

One more quirk worth knowing: an execute whose own playback settings keep it **active** with its
fader at zero reports `100`, because the reported value follows activation rather than fader
position. An "Execute release" button pointed at such an execute will stay lit.

## Feedbacks

| Feedback       | What it does                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Playback Level | Set feedback based on the playback fader level (0 - 100%)                                                    |
| Playback Flash | Set feedback based on the playback flash button (on/off)                                                     |
| Execute Level  | Set feedback based on the execute fader or button level (0 - 100%)                                           |
| Desk Black Out | Lights while this connection believes DBO is on. MagicQ never reports DBO, so it follows what Companion sent |

## Variables

- Playback Level
- Playback Flash
- Execute Level
