# Axle load and overload penalty calculator

A single-page tool that works out **how many more tonnes are safe to load**, and **what the overload costs if you cross the line** — before the vehicle leaves the yard rather than after the weighbridge.

It does four things:

1. **Builds the permissible gross vehicle weight from the axle configuration.** Indian axle-weight limits are not in the Motor Vehicles Act; they are notified under **section 58(1)**, so the permissible weight has to be summed from the vehicle's axle groups — a steering axle on two tyres, a driving axle on four, a tandem bogie, a tri-axle bogie — then the statutory ceiling applied (49 t rigid, 55 t semi-articulated and truck-trailer).
2. **Finds the limit that actually binds.** **Section 113(3)** forbids driving a vehicle whose laden weight exceeds the gross vehicle weight *in the certificate of registration*. Section 58(2)(c) puts that figure in the RC and section 58(3) stops it differing from the notification, but an older registration may still carry a lower rating — so the RC figure wins when you enter one, with the notified figure kept beside it as a cross-check.
3. **Computes the excess and the penalty.** The Explanation to the notification allows a tolerance of up to five per cent in gross vehicle weight for compliance with section 113(3); above that threshold, **section 194(1)** charges a base amount plus a per-tonne amount on the excess load, plus off-loading charges. At exactly zero excess the penalty is zero — not the base amount.
4. **Says plainly what costs more than the fine.** The vehicle may not move until the excess is off, and overloading puts the insurance claim at risk.

Philippine mode applies **section 6 of Republic Act No. 8794** instead: twenty-five per cent of the motor vehicle user's charge, and a 13,500 kg axle-load cap.

## Who it is for

Tipper and truck owners, loaders, weighbridge clerks and dispatchers deciding how much to put on a vehicle — and anyone who has to explain to a customer why the last two tonnes are not going on this trip.

## The regulations it implements

| Figure | Source |
| --- | --- |
| Maximum safe axle weight, per axle type | **S.O. 3467(E)** dated 16 July 2018, notified under **section 58(1), Motor Vehicles Act 1988** (59 of 1988), F. No. RT-11028/11/2017-MVL, in supersession of S.O. 728(E) dated 18 October 1996 |
| Single axle with two tyres at 7.0 t | Notification dated **6 August 2018** substituting entry 1.2 (7.5 t as first notified). The gazette serial for that amendment comes from a scanned copy and is *not* treated as sourced here, so the date is cited rather than the serial |
| +1 t per axle on pneumatic suspension | Note to the table in S.O. 3467(E) — starred entries only (1.3, 2.1, 3.1) |
| Gross weight ceiling 49 t / 55 t | Paragraph 2, S.O. 3467(E) |
| 5% gross-weight tolerance | Explanation to S.O. 3467(E), for compliance with section 113(3) |
| The prohibition | **Section 113(3), Motor Vehicles Act 1988** |
| Weighing, off-loading, detention | **Section 114(1), Motor Vehicles Act 1988** |
| ₹20,000 + ₹2,000 per tonne of excess load + off-loading charges | **Section 194(1), Motor Vehicles Act 1988**, as amended by the **Motor Vehicles (Amendment) Act 2019 (Act 32 of 2019), section 78**, in force from 1 September 2019 (S.O. 3110(E) dated 28 August 2019). Before that: ₹2,000 + ₹1,000 per tonne. The 2019 Act also deleted the word "minimum" |
| ₹20,000 for a projecting load | **Section 194(1A)**, inserted by Act 32 of 2019 |
| ₹40,000 for refusing the weighbridge | **Section 194(2)**, as substituted by Act 32 of 2019 (was "may extend to three thousand rupees") |
| 25% of the MVUC; 13,500 kg axle cap | **Section 6, Republic Act No. 8794** (Philippines) |

Every one of these lives in exactly one named constant in `assets/engine.js`, with its section reference and the instrument that set it, labelled indicative and carrying the authority to confirm it against. Nothing numeric is duplicated anywhere else, and the axle-weight table, the ceilings, the tolerance and the fine amounts are all editable in the page.

## Honesty note

**Indicative only. This is a planning tool, not legal advice and not a valuation of your exposure.**

Figures that could *not* be sourced to a standard worth putting on a loader's screen are named as gaps rather than filled in:

- **Off-loading, crane, labour and godown charges.** Section 194(1) creates the liability but fixes no amount.
- **Detention and demurrage** while the vehicle stands at the check-post. Commercial, not statutory.
- **State compounding amounts** notified under **section 200**. What is collected at a roadside or a check-post is often that amount, not the figure in the Act, and it differs by State.
- **Any increase notified under section 199B**, which allows every fine in the Act to be raised by up to 10% a year with effect from 1 April. No notification actually effecting such an increase could be found, so the 2019 figures are used as they stand — override the amounts in the page if one has since been issued.
- **The Philippine permissible gross vehicle weight by axle configuration**, which is set by DPWH issuances under the implementing rules of RA 8794 rather than by the Act. Philippine mode asks for the figure from the OR/CR instead of guessing one. No tolerance comparable to India's five per cent was found in section 6, so the tolerance there starts at zero.

Two readings are genuinely unsettled and are offered as choices rather than decided silently: whether a **part tonne** of excess is charged as a whole tonne or pro-rata, and whether the **excess load** is measured from the permissible limit or from the tolerance threshold. The harsher reading is the default in both cases, because a planning number should not flatter you.

On insurance: insurers routinely repudiate or cut a claim on a vehicle that was overloaded at the time of the loss. Consumer forums have gone both ways — full repudiation upheld where the overload had a nexus with the accident, a reduced "non-standard" settlement (commonly 75%) allowed where it did not. The outcome turns on the facts, so the tool states the risk and does not put a number on it.

Confirm the limits against your vehicle's certificate of registration, the Ministry of Road Transport & Highways notifications and the Act text on India Code before relying on anything here. Nothing you type leaves the page — there are no network calls at all.

## How to run

No build step, no dependencies. Serve the folder over HTTP (the strict Content-Security-Policy needs a real origin, so opening `index.html` from the filesystem is not the same thing):

```sh
python3 -m http.server 8137
```

Then open <http://localhost:8137/>.

## Tests

The rules live in `assets/engine.js`, a pure module with no DOM and no network, loaded both as a browser global and as a CommonJS module. The table-driven suite in `tests/engine.test.js` covers each axle configuration, the statutory ceiling, at/just under/just over the permissible limit, the tolerance threshold, zero and negative inputs, both rounding modes, the overridable table and fine amounts, and the penalty at exactly zero excess:

```sh
node --test
```

MIT licensed.
