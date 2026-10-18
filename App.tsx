import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Vibration, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Face, useFaceDetector, FaceDetectorOptions } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { DrowsinessDetector, Status } from './drowsiness';

const options: FaceDetectorOptions = {
  performanceMode: 'fast',
  // classificationMode: 'all', // gives left/rightEyeOpenProbability
  // landmarkMode: 'none',
  // contourMode: 'none',
  trackingEnabled: false,
};

export default function App() {
  useKeepAwake();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { detectFaces } = useFaceDetector(options);
  const detector = useRef(new DrowsinessDetector()).current;

  const [status, setStatus] = useState<Status>('OK');
  const [perclos, setPerclos] = useState(0);
  const [running, setRunning] = useState(true);
  const lastSpoken = useRef(0);

  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission]);

  const onFaces = useCallback((faces: Face[]) => {
    const f = faces[0];
    const eyeOpen = f
      ? ((f.leftEyeOpenProbability ?? 1) + (f.rightEyeOpenProbability ?? 1)) / 2
      : null;
    const r = detector.update(eyeOpen);
    setStatus(r.status);
    setPerclos(r.perclos);
  }, []);
  const onFacesJS = Worklets.createRunOnJS(onFaces);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    onFacesJS(detectFaces(frame));
  }, [onFacesJS]);

  // Alarm: vibrate + speak, repeating every 3s while the state persists
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
        <Pressable style={styles.btn} onPress={() => setRunning(r => !r)}>
          <Text style={styles.btnText}>{running ? 'Stop' : 'Start'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  alarmBg: { backgroundColor: '#c00' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { height: 220, margin: 12, borderRadius: 16, overflow: 'hidden' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  status: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#ddd', fontSize: 16 },
  btn: { backgroundColor: '#fff', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  btnText: { fontWeight: '700', fontSize: 16 },
});