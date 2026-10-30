// What the report SAYS, in sentences, derived from what it shows.
//
// The tables answer "what are the numbers". A manager deciding on a plan also
// needs "what does this mean" and "what is this not telling me", and those
// two questions are where a report gets misread: an empty cell taken as zero
// use, a cost estimate taken as a bill, a 5-person figure taken as the whole
// team.
//
// Pure, and every sentence is DERIVED — nothing here is a fixed opinion about
// the team. A claim the data cannot support is left out rather than softened,
// because a confident sentence is read as a finding.

/**
 * The profiles whose traffic Dakara Router actually measured today.
 *
 * A row counts only when it is `measurable` — the source says the traffic
 * went through the router. A connection nobody has claimed carries no
 * profile, so it is named by its account instead: "2 profil" when one of them
 * is unattributed would overstate how much of the team is accounted for.
 */
function routerMeasuredProfiles(report) {
  const names = new Set();
  for (const r of report?.rows || []) {
    if (!r?.measurable) continue;
    const name = r.profile || r.account || r.email;
    if (name) names.add(String(name));
  }
  return names;
}

/**
 * Members who use Claude but never through Claude Code.
 *
 * These are exactly the people the cost table cannot price: Anthropic
 * publishes no per-person cost for chat or Cowork on a Team plan. Counting
 * them from the ACTIVITY rows rather than subtracting two totals keeps the
 * claim checkable — a reader can find each of them in the Adopsi Tim table.
 */
function chatOnlyMembers(report) {
  const members = report?.claudeWeb?.activity?.members || [];
  return members.filter((m) => {
    const code = Number(m?.codeSessions) || 0;
    const other = (Number(m?.chatMessages) || 0) + (Number(m?.coworkSessions) || 0);
    return code === 0 && other > 0;
  });
}

const pct = (n) => `${Math.round(Number(n) || 0)}%`;
const n0 = (n) => new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));
const usd = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  return `$${v.toFixed(2)}`;
};

/**
 * The lead paragraph: what happened, in order of what a decision rests on.
 *
 * @param {object} report from buildReport()
 * @returns {string[]} sentences; empty when there is nothing to say
 */
export function summaryNarrative(report) {
  const out = [];
  const act = report?.claudeWeb?.activity?.overview;
  const web = report?.claudeWeb?.summary;
  const s = report?.summary || {};

  // Adoption first: it is the widest number, and the one most often
  // understated by the narrower sources beneath it.
  if (act) {
    const sentence =
      `Dari ${n0(act.totalMembers)} anggota tim, ${n0(act.mau.value)} memakai Claude bulan ini ` +
      `(${pct(act.utilization.value)} kursi terpakai), dengan ${n0(act.dau.value)} aktif per hari.`;
    out.push(sentence);
  }

  if (web) {
    out.push(
      `Pemakaian Claude Code tercatat ${n0(web.totalSessions)} sesi oleh ${n0(web.activeUsers)} orang, ` +
        `setara ${usd(web.totalCostUsd)} bila dihitung dengan harga API.`
    );

    // Which products the money figure covers, and which it does not.
    //
    // The per-person cost table is fed by /api/claude_code/metrics_aggs —
    // Claude Code ONLY. Anthropic publishes no per-person cost for chat or
    // Cowork on a Team plan, so the people who only chat appear in Adopsi Tim
    // with sessions and messages but no money at all. Without this sentence a
    // reader totals the cost column and believes it is the team's whole
    // spend, which is the single most expensive misreading in this report.
    const chatOnly = chatOnlyMembers(report);
    if (chatOnly.length) {
      out.push(
        `Angka biaya itu HANYA Claude Code. ${n0(chatOnly.length)} orang lain memakai Claude ` +
          `lewat chat atau Cowork saja — pemakaian mereka terlihat di "Adopsi Tim", tapi ` +
          `Anthropic tidak menerbitkan biaya per orang untuk chat, jadi mereka tidak muncul ` +
          `di tabel biaya.`
      );
    } else {
      out.push(
        `Angka biaya itu HANYA Claude Code; pemakaian lewat chat dan Cowork tidak punya ` +
          `rincian biaya per orang dari Anthropic.`
      );
    }
  }

  // Who is actually measured PER PERSON, and who is not.
  //
  // The comparison that matters is against DAKARA ROUTER, not against Claude
  // Code. Claude Code usage on a claude.ai subscription is reported by
  // Anthropic as an org total; it is the router that attributes tokens and
  // cost to a named person, via the profile owning each connection. An
  // earlier version compared the team against Claude Code users and called
  // the difference "tidak terukur", which was wrong in both directions: it
  // counted Claude Code users as measured when the router never saw them,
  // and it ignored profiles entirely.
  const measuredPeople = routerMeasuredProfiles(report);
  if (act && measuredPeople.size >= 0) {
    const total = Number(act.mau.value) || 0;
    const covered = measuredPeople.size;
    const gap = total - covered;

    if (covered === 0) {
      out.push(
        `Belum ada profil yang koneksinya lewat Dakara Router, jadi token dan biaya ` +
          `belum bisa diuraikan per orang untuk seluruh ${n0(total)} pengguna.`
      );
    } else if (gap > 0) {
      out.push(
        `Token dan biaya terurai per orang hanya untuk ${n0(covered)} profil yang ` +
          `koneksinya lewat Dakara Router (${[...measuredPeople].join(", ")}). ` +
          `${n0(gap)} pengguna lain memakai Claude langsung lewat web atau Desktop, ` +
          `sehingga hanya terbaca persen kuotanya.`
      );
    } else {
      out.push(
        `Seluruh ${n0(total)} pengguna koneksinya lewat Dakara Router, jadi token dan ` +
          `biaya terurai per orang.`
      );
    }
  }

  // Quota risk, only when there is any. "Tidak ada yang mendekati limit" is
  // itself a finding worth stating, so both branches speak.
  if (s.accountCount) {
    out.push(
      s.atRiskCount > 0
        ? `${n0(s.atRiskCount)} dari ${n0(s.accountCount)} akun yang lewat router sudah di atas 90% kuota.`
        : `Tidak ada akun yang lewat router mendekati batas kuota.`
    );
  }

  if (s.limitDaysThisWeek > 0) {
    out.push(
      `Dalam 7 hari terakhir, limit tercapai pada ${n0(s.limitDaysThisWeek)} hari — ` +
        `indikasi paling langsung bahwa kapasitas paket sekarang kurang.`
    );
  }

  return out;
}

/**
 * How to read each part, and what it deliberately does not claim.
 *
 * Separate from the footnotes: those state facts about the method, this
 * tells the reader what to do with each table.
 *
 * @returns {Array<{heading: string, lines: string[]}>}
 */
export function readingGuide(report) {
  const guide = [];
  const hasAct = Boolean(report?.claudeWeb?.activity?.overview);
  const hasWeb = Boolean(report?.claudeWeb?.summary);
  const hasRows = Boolean(report?.rows?.length);

  if (hasAct) {
    guide.push({
      heading: "Adopsi Tim",
      lines: [
        "Cakupan terluas: seluruh anggota, semua produk Claude (chat, Cowork, Claude Code).",
        "\"Kursi terpakai\" = berapa persen anggota yang benar-benar memakai Claude bulan ini. Ini angka untuk menilai apakah jumlah kursi sekarang pas.",
        "Kolom Pesan dan Sesi menunjukkan CARA orang memakai Claude, bukan biayanya. Seseorang bisa sangat aktif di chat dengan biaya tak terukur.",
        "Kolom \"Sesi Code\" bernilai 0 berarti orang itu tidak memakai Claude Code — pemakaiannya nyata, hanya tidak punya angka biaya per orang.",
      ],
    });
  }

  if (hasWeb) {
    guide.push({
      heading: "Pemakaian Claude Code",
      lines: [
        "HANYA Claude Code. Orang yang memakai Claude lewat chat atau Cowork saja tidak muncul di tabel ini sama sekali — cari mereka di \"Adopsi Tim\".",
        "Anthropic tidak menerbitkan biaya per orang untuk chat dan Cowork pada paket Team, jadi kolom biaya di sini BUKAN total belanja tim.",
        "\"Est. biaya\" adalah perkiraan SETARA harga API, bukan tagihan. Paket Team ditagih per kursi, jadi angka ini dipakai untuk membandingkan beban antar orang, bukan untuk merekonsiliasi invoice.",
        "Urutan dari termahal: baris teratas adalah yang paling membebani kapasitas.",
      ],
    });
  }

  if (hasRows) {
    guide.push({
      heading: "Tabel kuota per akun",
      lines: [
        "Cakupan tersempit: hanya koneksi yang dikenal router ini.",
        "Persen kuota berlaku untuk SEMUA pemakaian akun itu, termasuk yang lewat Desktop — jadi kolom ini tetap bermakna meski kolom token kosong.",
        "\"tak terukur\" berarti alat ini tidak bisa mengukurnya, BUKAN berarti akunnya tidak dipakai.",
        "\"tidak ada\" berarti Anthropic tidak mengembalikan jendela kuota itu untuk akun tersebut.",
      ],
    });
  }

  // Charts are only worth explaining when at least one was drawn.
  const hasChart =
    (report?.claudeWeb?.series || []).length > 0 ||
    (report?.claudeWeb?.activity?.series || []).length > 0;
  if (hasChart) {
    guide.push({
      heading: "Grafik harian",
      lines: [
        "Tinggi batang relatif terhadap hari tertinggi pada rentang itu, bukan terhadap kuota.",
        "Hari tanpa batang berarti nol pada hari itu — bukan data yang hilang.",
      ],
    });
  }

  return guide;
}

/**
 * What this report cannot tell you.
 *
 * Stated as its own block rather than buried in footnotes: every limit here
 * is one that, if missed, turns a number into the wrong decision.
 */
export function limitations(report) {
  const out = [];
  const c = report?.coverage || {};
  const s = report?.summary || {};

  if (c.partial) {
    out.push(
      `Sampling kuota hari ini baru ${n0(c.samplesTaken)} dari ${n0(c.samplesExpected)} ` +
        `(${pct(c.percent)}). Persentase kuota di bawah kemungkinan lebih rendah dari kenyataan.`
    );
  }

  if (s.unmeasuredCount > 0) {
    out.push(
      `${n0(s.unmeasuredCount)} akun hanya terbaca kuotanya; token dan biaya per akun tidak tersedia untuk mereka.`
    );
  }

  if (s.failedReadCount > 0) {
    out.push(
      `${n0(s.failedReadCount)} akun gagal dibaca. Akun itu tidak dihitung aman maupun berisiko.`
    );
  }

  const err = report?.claudeWeb?.error || report?.claudeWeb?.activityError;
  if (err) {
    out.push(`Sebagian data claude.ai tidak terbaca (${err}), jadi bagian terkait mungkin tidak lengkap.`);
  }

  return out;
}
