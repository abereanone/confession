import React, { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import confessionsJson from "./src/data/confessions.json";

type Unit = {
  number: number;
  title: string;
  content: string[];
};

type Confession = {
  slug: string;
  shortCode: string;
  title: string;
  unitLabel: string;
  units: Unit[];
};

type ConfessionData = {
  updatedAt: string;
  items: Confession[];
};

const data = confessionsJson as ConfessionData;

type Tab = "home" | "confessions" | "scriptures";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const confessions = data.items;
  const selected = confessions.find((item) => item.slug === selectedSlug) ?? confessions[0] ?? null;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return confessions;
    }
    return confessions.filter(
      (item) => item.title.toLowerCase().includes(value) || item.shortCode.toLowerCase().includes(value)
    );
  }, [confessions, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Confessions Hub</Text>
        <Text style={styles.meta}>Updated {data.updatedAt}</Text>
      </View>

      <View style={styles.tabs}>
        <TabButton label="Home" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="Confessions" active={tab === "confessions"} onPress={() => setTab("confessions")} />
        <TabButton label="Scriptures" active={tab === "scriptures"} onPress={() => setTab("scriptures")} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
        {tab === "home" ? (
          <View>
            <Text style={styles.h2}>Quick Find</Text>
            <Text style={styles.p}>Use the Confessions tab to browse WCF, LBCF, Savoy, and Belgic content.</Text>
            <Text style={styles.p}>Use the Scriptures tab to wire BSB lookups and cross-links.</Text>
          </View>
        ) : null}

        {tab === "confessions" ? (
          <View>
            <Text style={styles.h2}>Confessions</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search confessions"
              placeholderTextColor="#8aa69a"
            />

            {filtered.map((item) => (
              <TouchableOpacity key={item.slug} style={styles.card} onPress={() => setSelectedSlug(item.slug)}>
                <Text style={styles.cardCode}>{item.shortCode}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
              </TouchableOpacity>
            ))}

            {selected ? (
              <View style={styles.unitWrap}>
                <Text style={styles.h3}>{selected.title}</Text>
                {selected.units.map((unit) => (
                  <View key={`${selected.slug}-${unit.number}`} style={styles.unitCard}>
                    <Text style={styles.unitTitle}>
                      {selected.unitLabel} {unit.number}: {unit.title}
                    </Text>
                    {unit.content.map((line, idx) => (
                      <Text key={idx} style={styles.p}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === "scriptures" ? (
          <View>
            <Text style={styles.h2}>Scripture Lookup (BSB)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John 3:16"
              placeholderTextColor="#8aa69a"
            />
            <Text style={styles.p}>Scaffold only: connect this screen to your BSB data and reference parser.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.tab, active ? styles.tabActive : undefined]} onPress={onPress}>
      <Text style={[styles.tabText, active ? styles.tabTextActive : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1614" },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#243a31" },
  title: { color: "#c8f2dc", fontWeight: "700", fontSize: 20 },
  meta: { color: "#8cb39f", marginTop: 2 },
  tabs: { flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "#1f322b" },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#1b2c26" },
  tabActive: { backgroundColor: "#2c4a3f" },
  tabText: { color: "#a7c9bb", fontWeight: "600" },
  tabTextActive: { color: "#d7efe4" },
  body: { flex: 1 },
  bodyInner: { padding: 16, paddingBottom: 40 },
  h2: { color: "#d7efe4", fontWeight: "700", fontSize: 18, marginBottom: 10 },
  h3: { color: "#d7efe4", fontWeight: "700", fontSize: 16, marginTop: 12, marginBottom: 8 },
  p: { color: "#b5d0c4", lineHeight: 20, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#335446",
    borderRadius: 8,
    color: "#d7efe4",
    backgroundColor: "#14201c",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#172722",
    borderWidth: 1,
    borderColor: "#2e4b41",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  cardCode: { color: "#8ecab2", fontWeight: "700" },
  cardTitle: { color: "#d7efe4", marginTop: 2 },
  unitWrap: { marginTop: 8 },
  unitCard: {
    backgroundColor: "#13201c",
    borderWidth: 1,
    borderColor: "#29443a",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  unitTitle: { color: "#ccead9", fontWeight: "600", marginBottom: 8 },
});

