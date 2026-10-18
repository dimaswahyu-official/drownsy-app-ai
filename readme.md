# DrowsyGuard (open-source AI: MediaPipe Face Landmarker, Apache-2.0)

## 1. Create project
npx create-expo-app@latest drowsy-guard --template blank-typescript
cd drowsy-guard
# copy App.tsx, drowsiness.ts, babel.config.js, metro.config.js, app.json over the generated ones

## 2. Get the open model (run on your PC)
mkdir -p assets && cd assets
curl -L -o face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
unzip face_landmarker.task          # .task is a zip; we need face_landmarks_detector.tflite
rm face_landmarker.task face_detector.tflite face_blendshapes.tflite
cd ..

## 3. Install deps
npx expo install expo-speech expo-keep-awake expo-dev-client
npm i react-native-vision-camera@4.7.2 --save-exact
npm i react-native-worklets-core react-native-fast-tflite vision-camera-resize-plugin

## 4. Run on your Android phone (dev build; Expo Go will NOT work)
npx expo prebuild --clean
npx expo run:android

## 5. Calibrate (important, 2 minutes)
Watch the blue debug line "EAR x.xx face-score y.yy".
- Eyes open should read roughly 0.25-0.35; eyes closed under ~0.18. Adjust CONFIG.EYE_CLOSED_BELOW in drowsiness.ts.
- Face out of frame: face-score should drop. Set FACE_SCORE_MIN in App.tsx between the two readings.
- If EAR is erratic with a normal face, change ROTATION in App.tsx ('0deg','90deg','180deg','270deg').
- Model not loading / no output? Print tflite.model.outputs to confirm output shapes (expect 1434 and 1 values).

## 6. Release
eas build -p android --profile production     # .aab -> Play Console internal testing