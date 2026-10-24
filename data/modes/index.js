// The preset list, in display order.
//
// Order matters — it is the order presets appear in the PRESETS & COT tab, and
// newest-first is deliberate. Adding a preset generation means adding a file
// here and one line below; adding a preset to an existing generation means
// editing only that generation's file.

import { modes_v11taina } from "./v11taina.js";
import { modes_v11 } from "./v11.js";
import { modes_v10 } from "./v10.js";
import { modes_v9 } from "./v9.js";
import { modes_v8 } from "./v8.js";
import { modes_v7 } from "./v7.js";
import { modes_legacy } from "./legacy.js";

export const modes = [
    ...modes_v11taina,
    ...modes_v11,
    ...modes_v10,
    ...modes_v9,
    ...modes_v8,
    ...modes_v7,
    ...modes_legacy,
];
