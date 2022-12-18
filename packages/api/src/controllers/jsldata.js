const { filterName } = require('dbgate-tools');
const fs = require('fs');
const lineReader = require('line-reader');
const _ = require('lodash');
const { __ } = require('lodash/fp');
const DatastoreProxy = require('../utility/DatastoreProxy');
const { saveFreeTableData } = require('../utility/freeTableStorage');
const getJslFileName = require('../utility/getJslFileName');
const JsonLinesDatastore = require('../utility/JsonLinesDatastore');
const requirePluginFunction = require('../utility/requirePluginFunction');
const socket = require('../utility/socket');

function readFirstLine(file) {
  return new Promise((resolve, reject) => {
    lineReader.open(file, (err, reader) => {
      if (err) {
        reject(err);
        return;
      }
      if (reader.hasNextLine()) {
        reader.nextLine((err, line) => {
          if (err) reject(err);
          resolve(line);
        });
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = {
  datastores: {},

  // closeReader(jslid) {
  //   // console.log('CLOSING READER');
  //   if (!this.openedReaders[jslid]) return Promise.resolve();
  //   return new Promise((resolve, reject) => {
  //     this.openedReaders[jslid].reader.close((err) => {
  //       if (err) reject(err);
  //       delete this.openedReaders[jslid];
  //       resolve();
  //     });
  //   });
  // },

  // readLine(readerInfo) {
  //   return new Promise((resolve, reject) => {
  //     const { reader } = readerInfo;
  //     if (!reader.hasNextLine()) {
  //       resolve(null);
  //       return;
  //     }
  //     reader.nextLine((err, line) => {
  //       if (readerInfo.readedSchemaRow) readerInfo.readedDataRowCount += 1;
  //       else readerInfo.readedSchemaRow = true;
  //       if (err) reject(err);
  //       resolve(line);
  //     });
  //   });
  // },

  // openReader(jslid) {
  //   // console.log('OPENING READER');
  //   // console.log(
  //   //   'OPENING READER, LINES=',
  //   //   fs.readFileSync(path.join(jsldir(), `${jslid}.jsonl`), 'utf-8').split('\n').length
  //   // );
  //   const file = getJslFileName(jslid);
  //   return new Promise((resolve, reject) =>
  //     lineReader.open(file, (err, reader) => {
  //       if (err) reject(err);
  //       const readerInfo = {
  //         reader,
  //         readedDataRowCount: 0,
  //         readedSchemaRow: false,
  //         isReading: true,
  //       };
  //       this.openedReaders[jslid] = readerInfo;
  //       resolve(readerInfo);
  //     })
  //   );
  // },

  // async ensureReader(jslid, offset) {
  //   if (this.openedReaders[jslid] && this.openedReaders[jslid].readedDataRowCount > offset) {
  //     await this.closeReader(jslid);
  //   }
  //   let readerInfo = this.openedReaders[jslid];
  //   if (!this.openedReaders[jslid]) {
  //     readerInfo = await this.openReader(jslid);
  //   }
  //   readerInfo.isReading = true;
  //   if (!readerInfo.readedSchemaRow) {
  //     await this.readLine(readerInfo); // skip structure
  //   }
  //   while (readerInfo.readedDataRowCount < offset) {
  //     await this.readLine(readerInfo);
  //   }
  //   return readerInfo;
  // },

  async ensureDatastore(jslid, formatterFunction) {
    const rowFormatter = requirePluginFunction(formatterFunction);
    const dskey = `${jslid}||${formatterFunction}`;
    let datastore = this.datastores[dskey];
    if (!datastore) {
      datastore = new JsonLinesDatastore(getJslFileName(jslid), rowFormatter);
      // datastore = new DatastoreProxy(getJslFileName(jslid));
      this.datastores[dskey] = datastore;
    }
    return datastore;
  },

  getInfo_meta: true,
  async getInfo({ jslid }) {
    const file = getJslFileName(jslid);
    try {
      const firstLine = await readFirstLine(file);
      if (firstLine) {
        const parsed = JSON.parse(firstLine);
        if (parsed.__isStreamHeader) {
          return parsed;
        }
        return {
          __isStreamHeader: true,
          __isDynamicStructure: true,
        };
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  getRows_meta: true,
  async getRows({ jslid, offset, limit, filters, formatterFunction }) {
    const datastore = await this.ensureDatastore(jslid, formatterFunction);
    return datastore.getRows(offset, limit, _.isEmpty(filters) ? null : filters);
  },

  getStats_meta: true,
  getStats({ jslid }) {
    const file = `${getJslFileName(jslid)}.stats`;
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        return {};
      }
    }
    return {};
  },

  loadFieldValues_meta: true,
  async loadFieldValues({ jslid, field, search, formatterFunction }) {
    const datastore = await this.ensureDatastore(jslid, formatterFunction);
    const res = new Set();
    await datastore.enumRows(row => {
      if (!filterName(search, row[field])) return true;
      res.add(row[field]);
      return res.size < 100;
    });
    // @ts-ignore
    return [...res].map(value => ({ value }));
  },

  async notifyChangedStats(stats) {
    // console.log('SENDING STATS', JSON.stringify(stats));
    const datastore = this.datastores[stats.jslid];
    if (datastore) await datastore.notifyChanged();
    socket.emit(`jsldata-stats-${stats.jslid}`, stats);

    // const readerInfo = this.openedReaders[stats.jslid];
    // if (readerInfo && readerInfo.isReading) {
    //   readerInfo.closeAfterReadAndSendStats = stats;
    // } else {
    //   await this.closeReader(stats.jslid);
    //   socket.emit(`jsldata-stats-${stats.jslid}`, stats);
    // }
  },

  saveFreeTable_meta: true,
  async saveFreeTable({ jslid, data }) {
    saveFreeTableData(getJslFileName(jslid), data);
    return true;
  },

  saveText_meta: true,
  async saveText({ jslid, text }) {
    await fs.promises.writeFile(getJslFileName(jslid), text);
    return true;
  },

  extractTimelineChart_meta: true,
  async extractTimelineChart({ jslid, formatterFunction, measures }) {
    const formater = requirePluginFunction(formatterFunction);
    const datastore = new JsonLinesDatastore(getJslFileName(jslid), formater);
    let mints = null;
    let maxts = null;
    // pass 1 - counts stats, time range
    await datastore.enumRows(row => {
      if (!mints || row.ts < mints) mints = row.ts;
      if (!maxts || row.ts > maxts) maxts = row.ts;
      return true;
    });
    const minTime = new Date(mints).getTime();
    const maxTime = new Date(maxts).getTime();
    const duration = maxTime - minTime;
    const STEPS = 100;
    const step = duration / STEPS;
    const labels = _.range(STEPS).map(i => new Date(minTime + step / 2 + step * i));

    const datasets = measures.map(m => ({
      label: m.label,
      data: Array(STEPS).fill(0),
    }));

    // pass 2 - count measures
    await datastore.enumRows(row => {
      if (!mints || row.ts < mints) mints = row.ts;
      if (!maxts || row.ts > maxts) maxts = row.ts;

      for (let i = 0; i < measures.length; i++) {
        const part = Math.round((new Date(row.ts).getTime() - minTime) / step);
        datasets[i].data[part] += row[measures[i].field];
      }
      return true;
    });

    datastore._closeReader();

    return {
      labels,
      datasets,
    };
  },
};
