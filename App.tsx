import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Vibration, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSharedValue, Worklets } from 'react-native-worklets-core';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { DrowsinessDetector, Status, computeEAR } from './Drowsiness';

const SIZE = 256; // MediaPipe face landmarks model input
type Rot = '0deg' | '90deg' | '180deg' | '270deg';
const ROTATIONS: Rot[] = ['0deg', '90deg', '180deg', '270deg'];


export default function App() {
  useKeepAwake();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const tflite = useTensorflowModel(require('./assets/face_landmarks_detector.tflite'));
  const model = tflite.state === 'loaded' ? tflite.model : undefined;
  const { resize } = useResizePlugin();
  const detector = useRef(new DrowsinessDetector()).current;
  const [rotIdx, setRotIdx] = useState(3);
  const rotation = ROTATIONS[rotIdx];
  const FACE_SCORE_MIN = 0; // raw "face present" output; tune using the debug line
  const [status, setStatus] = useState<Status>('OK');
  const [perclos, setPerclos] = useState(0);
  const [debug, setDebug] = useState('');
  const [running, setRunning] = useState(true);
  const lastSpoken = useRef(0);
  const lastRun = useSharedValue(0);

  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission]);

  useEffect(() => {
  if (tflite.state === 'loaded') {
    console.log('inputs', JSON.stringify(tflite.model.inputs));
    console.log('outputs', JSON.stringify(tflite.model.outputs));
  }
}, [tflite.state]);

  const onResult = useCallback((ear: number | null, scores: string) => {
    const r = detector.update(ear);
    setStatus(r.status);
    setPerclos(r.perclos);
    setDebug(`EAR ${ear?.toFixed(2) ?? '-'}  scores ${scores}`);
  }, []);
  const onResultJS = Worklets.createRunOnJS(onResult);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (model == null) return;
    const now = Date.now();
    if (now - lastRun.value < 66) return;
    lastRun.value = now;

    const s = Math.min(frame.width, frame.height);
    const input = resize(frame, {
      scale: { width: SIZE, height: SIZE },
      crop: { x: (frame.width - s) / 2, y: (frame.height - s) / 2, width: s, height: s },
      pixelFormat: 'rgb',
      dataType: 'float32',
      rotation: rotation,
    });
    const out = model.runSync([input]);

    let lm: Float32Array | undefined;
    const sc: number[] = [];
    for (const o of out) {
      if (o.length === 478 * 3) lm = o as unknown as Float32Array;
      else if (o.length === 1) sc.push(Number(o[0]));
    }
    const scores = sc.map(v => v.toFixed(2)).join(' / ');
    if (!lm || sc.length === 0) { onResultJS(null, 'none'); return; }
    onResultJS(sc[0] > FACE_SCORE_MIN ? computeEAR(lm) : null, scores);
  }, [model, resize, onResultJS, lastRun, rotation]);

  useEffect(() => {
    if (status === 'DROWSY' || status === 'NO_FACE') {
      const now = Date.now();
      if (now - lastSpoken.current > 3000) {
        lastSpoken.current = now;
        Vibration.vibrate([0, 500, 200, 500]);
        Speech.speak(status === 'DROWSY' ? 'Wake up! Pull over and rest.' : 'Please look at the road.', { rate: 1.1 });
      }
    }
  }, [status, perclos]);

  if (!hasPermission) return <View style={styles.center}><Text>Camera permission needed</Text></View>;
  if (!device) return <View style={styles.center}><Text>No front camera found</Text></View>;

  const alarm = status === 'DROWSY' || status === 'NO_FACE';
  return (
    <View style={[styles.container, alarm && styles.alarmBg]}>
      <Camera style={styles.preview} device={device} isActive={running} frameProcessor={frameProcessor} pixelFormat="yuv" />
      <View style={styles.overlay}>
        <Text style={styles.status}>
          {status === 'OK' ? '😊 Alert' : status === 'WARNING' ? '⚠️ Eyes closing…' : status === 'DROWSY' ? '🚨 DROWSY!' : '👀 Look at the road'}
        </Text>
        <Text style={styles.sub}>Eyes-closed (30s): {(perclos * 100).toFixed(0)}%</Text>
        <Text style={styles.debug}>{tflite.state !== 'loaded' ? `model: ${tflite.state}` : debug}</Text>
        <Pressable style={styles.btn} onPress={() => setRunning(r => !r)}>
          <Text style={styles.btnText}>{running ? 'Stop' : 'Start'}</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => setRotIdx(i => (i + 1) % 4)}>
          <Text style={styles.btnText}>Rotation {rotation}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  alarmBg: { backgroundColor: '#c00' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '92%', aspectRatio: 1, alignSelf: 'center', margin: 12, borderRadius: 16, overflow: 'hidden' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  status: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#ddd', fontSize: 16 },
  debug: { color: '#9cf', fontSize: 13, fontFamily: 'monospace' },
  btn: { backgroundColor: '#fff', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  btnText: { fontWeight: '700', fontSize: 16 },
});