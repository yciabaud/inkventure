// The Lamp at Saltmere, as a choice-based ink story: a tiny fixture written for Inkventure (MIT).
// Compiled to lamp.json with scripts/fixtures/build-ink.sh. Walkthrough (taps only): 1, 1, 1, 1 (take the can, climb, fill, light).
# title: The Lamp at Saltmere
# author: Inkventure Fixtures

VAR has_can = false
VAR lamp_filled = false

-> landing

=== landing ===
# chapter: The Landing Stage
The ferry leaves you on the landing stage of Saltmere. Night is falling, and the lighthouse above the harbour is dark.
A paraffin can stands by the bollard.
+ [Take the paraffin can]
    ~ has_can = true
    You pick up the paraffin can. It sloshes, nearly full.
    -> foot
+ [Walk up to the lighthouse]
    -> foot

=== foot ===
# chapter: Foot of the Tower
The lighthouse door is ajar. A spiral stair climbs into the dark.
* {not has_can} [Go back for the paraffin can]
    ~ has_can = true
    You fetch the paraffin can from the landing stage.
    -> foot
+ [Climb the stair]
    -> lamp_room
+ [Wait for morning]
    You sit on the step and wait. No ship will find the harbour tonight.
    -> ending_dark

=== lamp_room ===
# chapter: The Lamp Room
The great lamp sits in its brass cradle, its reservoir {lamp_filled:full of paraffin|dry}.
+ {has_can and not lamp_filled} [Fill the lamp]
    ~ lamp_filled = true
    You pour the paraffin into the reservoir.
    -> lamp_room
+ {lamp_filled} [Light the lamp]
    -> ending_lit
+ [Go back down]
    -> foot

=== ending_lit ===
# chapter: Epilogue
The wick catches, and the beam sweeps out over the water. Far off, a ship's horn answers.
THE END: you have lit the lamp.
-> END

=== ending_dark ===
# chapter: Epilogue
THE END: the lamp stays dark.
-> END
