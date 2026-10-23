// Runs in a time/memory-bounded Node worker. Only metadata is returned to the app.
import { parentPort, workerData } from "node:worker_threads";
import { createFile } from "mp4box";
try {
  const bytes = Buffer.from(workerData.bytes);
  let offset = 0,
    count = 0;
  const types = [];
  const payloads = [];
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length || ++count > 1000) throw Error();
    const size = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8);
    if (size < 8 || offset + size > bytes.length) throw Error();
    types.push(type);
    if (type === "mdat") payloads.push([offset + 8, offset + size]);
    offset += size;
  }
  if (
    types[0] !== "ftyp" ||
    !types.includes("moov") ||
    !types.includes("mdat") ||
    types.includes("moof")
  )
    throw Error();
  const file = createFile();
  let info;
  let failed = false;
  file.onReady = (value) => {
    info = value;
  };
  file.onError = () => {
    failed = true;
  };
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  buffer.fileStart = 0;
  file.appendBuffer(buffer);
  file.flush();
  if (
    failed ||
    !info ||
    info.isFragmented ||
    !Number.isFinite(info.duration / info.timescale) ||
    info.duration / info.timescale <= 0 ||
    info.duration / info.timescale > 90 ||
    info.videoTracks.length !== 1 ||
    info.tracks.length > 2
  )
    throw Error();
  for (const t of info.tracks) {
    const samples = file.getTrackSamplesInfo(t.id);
    if (
      !samples.length ||
      samples.length !== t.nb_samples ||
      samples.length > 12000 ||
      !Number.isFinite(t.duration / t.timescale) ||
      t.duration / t.timescale > 90
    )
      throw Error();
    for (const sample of samples) {
      if (
        !Number.isSafeInteger(sample.offset) ||
        !Number.isSafeInteger(sample.size) ||
        sample.size < 1 ||
        !payloads.some(
          ([start, end]) =>
            sample.offset >= start && sample.offset + sample.size <= end,
        )
      )
        throw Error();
    }
    if (t.video) {
      if (
        !/^avc1\./.test(t.codec) ||
        t.video.width > 1920 ||
        t.video.height > 1080 ||
        t.video.width < 1 ||
        t.video.height < 1 ||
        !t.nb_samples ||
        t.nb_samples > 10800
      )
        throw Error();
    } else if (!t.audio || t.codec !== "mp4a.40.2" || t.audio.channel_count > 2)
      throw Error();
  }
  parentPort.postMessage({ ok: true });
} catch {
  parentPort.postMessage({ ok: false });
}
