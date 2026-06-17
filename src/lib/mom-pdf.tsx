import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { MoMStructured } from './groq';

export interface MoMAttendee {
  name: string;
  role: string;
}

export interface MoMData {
  meetingType: string;
  date: string;
  time: string;
  platform: string;
  preparedBy: string;
  reviewedBy: string;
  attendees: MoMAttendee[];
  agenda: string[];
  discussion: MoMStructured['discussion'];
}

// Times-Roman/Times-Bold are PDF standard fonts — no font file to embed,
// and they render fine without the bullet/dash Unicode glyphs we avoid
// anyway. Headings stay left/center-aligned on purpose; every other run of
// text is justified per spec.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 12, color: '#1e293b', fontFamily: 'Times-Roman' },
  title: { fontSize: 18, fontFamily: 'Times-Bold', textAlign: 'center' },
  subtitle: { fontSize: 11, fontFamily: 'Times-Roman', color: '#64748b', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  hr: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16 },
  sectionHeading: { fontSize: 16, fontFamily: 'Times-Bold', textAlign: 'left', marginTop: 18, marginBottom: 8, color: '#0f172a' },
  subHeading: { fontSize: 14, fontFamily: 'Times-Bold', textAlign: 'left', marginTop: 10, marginBottom: 4, color: '#0f172a' },
  text: { fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  detailsTable: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 2 },
  detailsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  detailsRowLast: { flexDirection: 'row' },
  detailsLabel: { width: '30%', padding: 6, backgroundColor: '#f8fafc', fontSize: 12, fontFamily: 'Times-Bold', textAlign: 'justify' },
  detailsValue: { width: '70%', padding: 6, fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  attendeeTable: { borderWidth: 1, borderColor: '#e2e8f0', marginTop: 4 },
  attendeeHeaderRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  attendeeRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  attendeeNo: { width: '10%', padding: 5, fontSize: 12, fontFamily: 'Times-Bold', textAlign: 'justify' },
  attendeeName: { width: '55%', padding: 5, fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  attendeeRole: { width: '35%', padding: 5, fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  bulletRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  bulletDot: { width: 12, fontSize: 12, fontFamily: 'Times-Roman' },
  bulletText: { flex: 1, fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  signRow: { flexDirection: 'row', marginTop: 24, justifyContent: 'space-between' },
  signBlock: { width: '45%' },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#94a3b8', marginBottom: 4, paddingTop: 16 },
  signText: { fontSize: 12, fontFamily: 'Times-Roman', textAlign: 'justify' },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 10, fontFamily: 'Times-Roman', color: '#94a3b8' },
});

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>-</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export function MoMDocument({ data }: { data: MoMData }) {
  const details: [string, string][] = [
    ['Meeting Type', data.meetingType || '-'],
    ['Date', data.date || '-'],
    ['Time', data.time || '-'],
    ['Platform', data.platform || '-'],
    ['Prepared By', data.preparedBy || '-'],
    ['Reviewed By', data.reviewedBy || '-'],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>MINUTES OF MEETING</Text>
        <Text style={styles.subtitle}>AWS Student Builder Group - SRM Institute of Science and Technology</Text>
        <View style={styles.hr} />

        <Text style={styles.sectionHeading}>Meeting Details</Text>
        <View style={styles.detailsTable}>
          {details.map(([label, value], i) => (
            <View key={label} style={i === details.length - 1 ? styles.detailsRowLast : styles.detailsRow}>
              <Text style={styles.detailsLabel}>{label}</Text>
              <Text style={styles.detailsValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeading}>1. Attendees</Text>
        <Text style={styles.text}>Total Participants: {data.attendees.length}</Text>
        <View style={styles.attendeeTable}>
          <View style={styles.attendeeHeaderRow}>
            <Text style={styles.attendeeNo}>No.</Text>
            <Text style={styles.attendeeName}>Name</Text>
            <Text style={styles.attendeeRole}>Role</Text>
          </View>
          {data.attendees.map((a, i) => (
            <View key={`${a.name}-${i}`} style={styles.attendeeRow}>
              <Text style={styles.attendeeNo}>{i + 1}</Text>
              <Text style={styles.attendeeName}>{a.name}</Text>
              <Text style={styles.attendeeRole}>{a.role || '-'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeading}>2. Agenda</Text>
        {data.agenda.length > 0
          ? data.agenda.map((item, i) => <Bullet key={i} text={item} />)
          : <Text style={styles.text}>-</Text>}

        <Text style={styles.sectionHeading}>3. Discussion Summary</Text>
        {data.discussion.length > 0 ? data.discussion.map((section, i) => (
          <View key={i}>
            <Text style={styles.subHeading}>3.{i + 1} {section.title}</Text>
            {section.points.map((p, j) => <Bullet key={j} text={p} />)}
          </View>
        )) : <Text style={styles.text}>-</Text>}

        <Text style={styles.sectionHeading}>4. Sign-Off</Text>
        <View style={styles.signRow}>
          <View style={styles.signBlock}>
            <View style={styles.signLine} />
            <Text style={styles.signText}>Prepared by: {data.preparedBy || '-'}</Text>
          </View>
          <View style={styles.signBlock}>
            <View style={styles.signLine} />
            <Text style={styles.signText}>Reviewed by: {data.reviewedBy || '-'}</Text>
          </View>
        </View>

        <Text style={styles.footer}>End of Minutes</Text>
      </Page>
    </Document>
  );
}

export async function renderMoMPdf(data: MoMData): Promise<Buffer> {
  return renderToBuffer(<MoMDocument data={data} />);
}
