import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";

type Props = TextInputProps & {
  label: string;
  containerStyle?: object;
  labelStyle?: object;
  inputStyle?: object;
};

export default function InputField({
  label,
  containerStyle,
  labelStyle,
  inputStyle,
  ...rest
}: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <TextInput
        {...rest}
        style={[styles.input, inputStyle]}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { marginBottom: 4, fontWeight: "600", fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    lineHeight: 21,
    color: "#000", // overridden by inputStyle
  },
});
