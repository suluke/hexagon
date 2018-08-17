# Hexagon
This is re-implementation of one of my favorite games, [*"Super Hexagon"*](http://distractionware.com/blog/2012/09/super-hexagon/) by Terry Cavanagh ([@terrycavanagh](https://twitter.com/terrycavanagh)).
The project currently only has the working title *Hexagon*.
It is implemented in ECMAScript (ES6) on top of the webgl apis.

## Current State of the Project
The following lists describe what is already working and what is still on the roadmap:

### Done
* basic hexagonal rendering
* basic gameplay
* perspective projection
* some music
* some obstacles
* partial title screen
* partial screen for gameplay
* original game font

### TODO
* more screens
* more levels
* more sounds
* more obstacles
* highlight current slot
* high-score tracking
* achievements
* mouse controls using left btn for left, right btn for right, middle for back and both for enter

### Non-goals
* FOV doesn't get bigger with more extreme aspect ratio:
    My new phone has a 2:1 aspect ratio and Super Hexagon just extends the field of view (FOV) to cover the additional space.
    The drawbacks: The game becomes easier because there is more to see. Furthermore, obstacles can be seen spawning - they "pop" up.
* Glitches:
    Spirals in the original game allow to move in the wrong direction for a layer or so because it's possible to glitch through two obstacles.
    I don't think it's in the spirit of the original game to allow mistakes, so I think this is a bug - and I don't want to recreate bugs.
* Online ranking:
    This is just broken in the original game. The top scores are all fake (multiple million seconds).
    Since this is an *open source* re-implementation, I don't see how I would rebuild this in a way that creates any additional value for players.

## Legal
The FontStruction “Bump IT UP”
(https://fontstruct.com/fontstructions/show/155156) by Aaron Amar is licensed
under a Creative Commons Attribution Share Alike license
(http://creativecommons.org/licenses/by-sa/3.0/).

The files [matrix.js](matrix.js) and [vector.js](vector.js) were taken from Evan Wallace's (evanw) [lightgl.js ](https://github.com/evanw/lightgl.js/) project.
They are licensed under the MIT license.

Music courtesy of [LuckyXXL](https://github.com/luckyxxl).
Many thanks for making the fantastic soundtrack!

Female voice sounds generated on [fromtexttospeech.com](http://www.fromtexttospeech.com/) using US English voice 'Alice'.
