/**
 * Mark memberships as Registered to Microsite when official MU ID is in the provided list.
 * Usage: npx tsx server/scripts/mark-microsite-registered.ts [--dry-run]
 */
import 'dotenv/config'
import pg from 'pg'

const dryRun = process.argv.includes('--dry-run')

const RAW_IDS = `
5683017
7529426
4974224
5059656
5292443
5256018
5556961
6225781
6297202
5715907
5710795
5313163
6753504
7264238
7873124
7873124
5138592
6327207
7487288
6214540
4523075
8467071
8467066
8467075
5314529
4441204
7117332
8480998
7242985
6749472
6299137
4167702
8158729
7487291
7243935
5513365
6757727
8072295
3367700
8471227
8501516
5059677
3793712
8023404
6647661
6170578
4476079
4916976
4917004
2824647
8030130
8471964
5117677
8021300
2265536
8021302
5645154
2193425
5636881
4203506
2828924
7300061
6526063
5905777
5062315
5540839
3665642
6851319
7682844
7682846
5292424
2419084
8085077
4906864
5151205
2193433
6465539
6465525
7256411
5313156
7818953
7263526
5109838
6003111
6464587
3712248
8160152
6249851
8501539
7929031
7929415
8235219
5031585
7124989
7443201
6957982
8349644
6349206
4535865
5682121
6784358
7976598
5117693
2416971
4917009
7255289
6188416
4942040
7324592
5193342
4185221
4774507
5717994
7151346
5715923
7151355
8094204
8209897
5292427
7937179
7489077
7968790
2732646
5878987
3793713
7180495
5868023
5825373
5897220
7264241
8501542
8482376
6659450
7957280
6323786
4910216
4917018
5644659
6049621
7260696
7678197
7678233
5714923
6785241
5112679
4775862
8094219
8480993
5292445
5514047
7300059
3859827
5295079
6185028
7529264
8480996
5648253
3057120
6246797
6239624
6239654
6323330
2193417
2466341
2740437
8094188
4988986
5687377
7246368
8053671
6611721
5292403
7452663
8487519
5504624
5689605
5292408
216321
5292440
4794465
3365616
7006101
7949934
8487526
6620415
2720570
2193352
4855494
6225759
3912768
2710009
5511998
8487499
5538738
6202747
3255576
7036495
8336519
4309216
5292453
8309130
5313162
6725453
8189587
6688150
8494400
4268218
5672797
4974021
4974031
5062479
5062482
3898719
8094200
5711280
`

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

const ids = [...new Set(RAW_IDS.split(/\s+/).map((s) => digitsOnly(s)).filter(Boolean))]

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

async function main(): Promise<void> {
  console.log(`[microsite] Unique IDs in list: ${ids.length}${dryRun ? ' (dry-run)' : ''}`)

  const client = await pool.connect()
  try {
    const { rows: matches } = await client.query<{
      application_id: string
      membership_number: string | null
      first_name: string | null
      last_name: string | null
      official_mu_membership_id: string | null
      admin_send_microsite: boolean
      status: string
    }>(
      `select application_id, membership_number, first_name, last_name,
              official_mu_membership_id, admin_send_microsite, status
       from public.membership_applications
       where nullif(regexp_replace(coalesce(official_mu_membership_id, ''), '\\D', '', 'g'), '') = any($1::text[])
       order by membership_number nulls last, last_name, first_name`,
      [ids],
    )

    const matchedNormalized = new Set(
      matches.map((r) => digitsOnly(r.official_mu_membership_id ?? '')).filter(Boolean),
    )
    const unmatched = ids.filter((id) => !matchedNormalized.has(id))
    const already = matches.filter((r) => r.admin_send_microsite)
    const toUpdate = matches.filter((r) => !r.admin_send_microsite)

    console.log(`[microsite] Matched applications: ${matches.length}`)
    console.log(`[microsite] Already ticked: ${already.length}`)
    console.log(`[microsite] Will tick: ${toUpdate.length}`)
    console.log(`[microsite] Unmatched IDs: ${unmatched.length}`)

    if (toUpdate.length > 0) {
      console.log('\n[microsite] Updating:')
      for (const r of toUpdate) {
        console.log(
          `  - #${r.membership_number ?? '?'} ${r.first_name ?? ''} ${r.last_name ?? ''} (${r.official_mu_membership_id}) [${r.status}]`,
        )
      }
    }

    if (!dryRun && toUpdate.length > 0) {
      const { rowCount } = await client.query(
        `update public.membership_applications
         set admin_send_microsite = true,
             admin_send_microsite_at = coalesce(admin_send_microsite_at, now())
         where nullif(regexp_replace(coalesce(official_mu_membership_id, ''), '\\D', '', 'g'), '') = any($1::text[])
           and admin_send_microsite = false`,
        [ids],
      )
      console.log(`\n[microsite] Updated rows: ${rowCount ?? 0}`)
    }

    if (unmatched.length > 0) {
      console.log('\n[microsite] Unmatched official membership IDs:')
      for (const id of unmatched) console.log(`  ${id}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
