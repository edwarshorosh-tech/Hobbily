/**
 * PracticeTimerModal
 * Countdown timer sheet used both for manual "Practice Now" sessions and for
 * auto-popups when a scheduled task's time arrives (see TimeContext's dueTask).
 */
import { View, Text, StyleSheet, TextInput, Modal, TouchableOpacity } from "react-native";
import { useState, useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

type TimerModalProps = {
  visible: boolean;
  onClose: () => void;
  onComplete: (minutes: number) => void;
  defaultTitle?: string;
  defaultMinutes?: number;
  colors: ReturnType<typeof useTheme>["colors"];
  /** When true, the countdown starts immediately instead of showing the setup screen. */
  autoStart?: boolean;
  /** Optional banner shown above the title, e.g. "Scheduled activity" */
  banner?: string;
};

const TIMER_PRESETS = [5, 10, 15, 30, 45, 60];

export default function PracticeTimerModal({
  visible,
  onClose,
  onComplete,
  defaultTitle = "Practice Session",
  defaultMinutes = 15,
  colors,
  autoStart = false,
  banner,
}: TimerModalProps) {
  const [sessionTitle, setSessionTitle] = useState(defaultTitle);
  const [selectedMinutes, setSelectedMinutes] = useState(defaultMinutes);
  const [secondsLeft, setSecondsLeft] = useState(-1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      reset();
    } else {
      // Sync props → state each time the modal freshly opens so that a
      // different hobby's title/duration is reflected (useState initial values
      // are only used on mount, not on subsequent renders).
      setSessionTitle(defaultTitle);
      setSelectedMinutes(defaultMinutes);
      if (autoStart) {
        setSecondsLeft(defaultMinutes * 60);
        setRunning(true);
        setDone(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // defaultTitle/defaultMinutes intentionally omitted — sync only on open

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    } else if (running && secondsLeft === 0) {
      clearInterval(intervalRef.current!);
      setRunning(false);
      setDone(true);
    }
    return () => clearInterval(intervalRef.current!);
  }, [running, secondsLeft]);

  function start() { setSecondsLeft(selectedMinutes * 60); setRunning(true); setDone(false); }
  function pause() { setRunning(false); clearInterval(intervalRef.current!); }
  function resume() { setRunning(true); }
  function skip() { clearInterval(intervalRef.current!); setSecondsLeft(0); setRunning(false); setDone(true); }
  function reset() { clearInterval(intervalRef.current!); setSecondsLeft(-1); setRunning(false); setDone(false); }

  const notStarted = secondsLeft === -1;
  const displayMin = notStarted ? selectedMinutes : Math.floor(secondsLeft / 60);
  const displaySec = notStarted ? 0 : secondsLeft % 60;
  const progress = notStarted ? 0 : 1 - secondsLeft / (selectedMinutes * 60);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={tStyles.overlay}>
        <View style={[tStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={tStyles.handle} />

          {done ? (
            <View style={tStyles.doneView}>
              <Ionicons name="checkmark-circle" size={72} color={colors.success} />
              <Text style={[tStyles.doneTitle, { color: colors.text }]}>Session Complete!</Text>
              <Text style={[tStyles.doneSub, { color: colors.secondaryText }]}>
                {selectedMinutes} min of {sessionTitle}
              </Text>
              <TouchableOpacity
                onPress={() => { onComplete(selectedMinutes); onClose(); }}
                style={[tStyles.btn, { backgroundColor: colors.success }]}
              >
                <Ionicons name="trophy-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={tStyles.btnText}>Save Progress</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={tStyles.skipBtn}>
                <Text style={[tStyles.skipText, { color: colors.secondaryText }]}>Discard</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {banner && (
                <View style={[tStyles.banner, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}>
                  <Ionicons name="alarm-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[tStyles.bannerText, { color: colors.primary }]}>{banner}</Text>
                </View>
              )}
              <Text style={[tStyles.timerTitle, { color: colors.text }]} numberOfLines={1}>{sessionTitle}</Text>

              {notStarted && (
                <>
                  <TextInput
                    style={[tStyles.titleInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                    value={sessionTitle}
                    onChangeText={setSessionTitle}
                    placeholder="Session title"
                    placeholderTextColor={colors.secondaryText}
                  />
                  <Text style={[tStyles.presetLabel, { color: colors.secondaryText }]}>Duration</Text>
                  <View style={tStyles.presets}>
                    {TIMER_PRESETS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setSelectedMinutes(m)}
                        style={[tStyles.preset, { backgroundColor: selectedMinutes === m ? colors.primary : colors.inputBackground, borderColor: selectedMinutes === m ? colors.primary : colors.border }]}
                      >
                        <Text style={{ color: selectedMinutes === m ? "#fff" : colors.secondaryText, fontWeight: "700", fontSize: 13 }}>{m}m</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Timer display */}
              <View style={tStyles.timerCircle}>
                <View style={[tStyles.timerCircleInner, { borderColor: notStarted ? colors.border : colors.primary }]}>
                  <Text style={[tStyles.timerTime, { color: colors.text }]}>
                    {String(displayMin).padStart(2, "0")}:{String(displaySec).padStart(2, "0")}
                  </Text>
                  {!notStarted && (
                    <Text style={[tStyles.timerPct, { color: colors.secondaryText }]}>
                      {Math.round(progress * 100)}%
                    </Text>
                  )}
                </View>
              </View>

              {/* Controls */}
              <View style={tStyles.controls}>
                {notStarted && (
                  <TouchableOpacity onPress={start} style={[tStyles.btn, { backgroundColor: colors.primary }]}>
                    <Ionicons name="play" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={tStyles.btnText}>Start</Text>
                  </TouchableOpacity>
                )}
                {running && (
                  <>
                    <TouchableOpacity onPress={pause} style={[tStyles.btn, { backgroundColor: colors.accent, flex: 1 }]}>
                      <Ionicons name="pause" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={tStyles.btnText}>Pause</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={skip} style={[tStyles.skipBtn2, { borderColor: colors.border }]}>
                      <Text style={[tStyles.skipText, { color: colors.secondaryText }]}>Skip</Text>
                    </TouchableOpacity>
                  </>
                )}
                {!running && !notStarted && !done && (
                  <>
                    <TouchableOpacity onPress={resume} style={[tStyles.btn, { backgroundColor: colors.primary, flex: 1 }]}>
                      <Ionicons name="play" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={tStyles.btnText}>Resume</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={skip} style={[tStyles.skipBtn2, { borderColor: colors.border }]}>
                      <Text style={[tStyles.skipText, { color: colors.secondaryText }]}>Done</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <TouchableOpacity onPress={onClose} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={[tStyles.skipText, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const tStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 20 },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 8, marginBottom: 14 },
  bannerText: { fontSize: 13, fontWeight: "700" },
  timerTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  titleInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  presetLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  presets: { flexDirection: "row", gap: 8, marginBottom: 16 },
  preset: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  timerCircle: { alignItems: "center", marginVertical: 16 },
  timerCircleInner: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  timerTime: { fontSize: 40, fontWeight: "900", letterSpacing: 2 },
  timerPct: { fontSize: 14, marginTop: 4 },
  controls: { flexDirection: "row", gap: 10, marginBottom: 12 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  skipBtn: { alignItems: "center", paddingVertical: 10 },
  skipBtn2: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  skipText: { fontSize: 14, fontWeight: "600" },
  doneView: { alignItems: "center", paddingVertical: 8, gap: 8 },
  doneTitle: { fontSize: 24, fontWeight: "800" },
  doneSub: { fontSize: 14, marginBottom: 8 },
});
