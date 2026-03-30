/**
 * Re-point expenses from an old Telegram group chat id to the new one.
 * (Common after basic group → supergroup upgrade: chat id changes.)
 *
 * By default updates **all** expenses for the old id so past months still show in /bill.
 *
 * Usage (use -- if ids start with -):
 *   node scripts/migrateGroupId.js -- <oldChatId> <newChatId>
 *   node scripts/migrateGroupId.js -- <oldChatId> <newChatId> <month> <year>   # one month only
 *   node scripts/migrateGroupId.js -- <oldChatId> <newChatId> --all             # same as two-arg form (all rows)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Expense = require('../models/Expense');

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * @param {object} opts
 * @param {string|number} opts.oldGroupId
 * @param {string|number} opts.newGroupId
 * @param {number} [opts.month] - ignored if allMonths
 * @param {number} [opts.year] - ignored if allMonths
 * @param {boolean} [opts.allMonths] - when true (default), update every expense for oldGroupId
 * @returns {Promise<{ matched: number, modified: number }>}
 */
async function migrateGroupId(opts) {
    const { oldGroupId, newGroupId, month, year, allMonths } = opts;
    const newStr = String(newGroupId);
    const oldNum = Number(oldGroupId);
    const oldIds = [String(oldGroupId)];
    if (!Number.isNaN(oldNum)) {
        oldIds.push(oldNum);
    }

    const filter = { groupId: { $in: [...new Set(oldIds)] } };
    if (!allMonths) {
        filter.month = month;
        filter.year = year;
    }

    const result = await Expense.updateMany(filter, { $set: { groupId: newStr } });
    return { matched: result.matchedCount, modified: result.modifiedCount };
}

function parseArgs(argv) {
    const rest = argv.slice(2).filter((a) => a !== '--');
    const wantsAllFlag = rest.includes('--all');
    const args = rest.filter((a) => a !== '--all');

    if (args.length < 2) {
        console.error(
            'Usage: node scripts/migrateGroupId.js -- <oldChatId> <newChatId>\n' +
                '       (migrates all months/years — use this so old bills show under the new chat)\n' +
                '       node scripts/migrateGroupId.js -- <oldChatId> <newChatId> <month> <year>\n' +
                '       (optional: only that month/year)'
        );
        process.exit(1);
    }

    if (args.length === 3) {
        console.error('Provide both month and year, or omit both for a full migration.');
        process.exit(1);
    }

    const oldGroupId = args[0];
    const newGroupId = args[1];
    let month = 1;
    let year = 2000;
    let allMonths = true;

    if (args.length >= 4) {
        month = parseInt(args[2], 10);
        year = parseInt(args[3], 10);
        if (Number.isNaN(month) || Number.isNaN(year)) {
            console.error('Invalid month or year.');
            process.exit(1);
        }
        if (month < 1 || month > 12 || year < 2000 || year > 2100) {
            console.error('Month must be 1–12 and year between 2000 and 2100.');
            process.exit(1);
        }
        allMonths = wantsAllFlag;
    }

    return { oldGroupId, newGroupId, month, year, allMonths };
}

async function main() {
    const { oldGroupId, newGroupId, month, year, allMonths } = parseArgs(process.argv);

    await mongoose.connect(MONGODB_URI);
    try {
        const { matched, modified } = await migrateGroupId({
            oldGroupId,
            newGroupId,
            month,
            year,
            allMonths
        });
        const scope = allMonths ? 'all months' : `${month}/${year}`;
        console.log(`migrateGroupId (${scope}): matched ${matched}, modified ${modified}`);
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { migrateGroupId };
