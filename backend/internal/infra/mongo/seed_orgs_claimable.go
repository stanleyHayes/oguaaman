package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// ── claimable institutions + places ──────────────────────────────────────────
// A broader roster of Cape Coast / Central Region schools (basic, senior high,
// technical/vocational, colleges of education, tertiary, nurses' training —
// public, mission and private) plus more heritage places. Seeded UNCLAIMED
// (Verified:false, no offices) so a member or the responsible office can claim
// and complete each page later. Inserted by slug top-up (existing slugs are
// never touched), so this is safe to run against a live database.

var seedClaimableOrgs = []domain.Organization{
	// ── Senior High Schools ──────────────────────────────────────────────────
	{ID: "ghana-national-college", Slug: "ghana-national-college", Kind: "school", Name: "Ghana National College", Founded: 1948, Classification: "Senior High · public, co-ed", GenderPolicy: "Mixed", BoardingType: "Day & Boarding", Jurisdiction: "Cape Coast, Central Region", Summary: "A public co-educational senior high school founded in 1948 by Kwame Nkrumah for students dismissed for political protest — a cradle of the independence generation."},
	{ID: "oguaa-senior-high-tech", Slug: "oguaa-senior-high-tech", Kind: "school", Name: "Oguaa Senior High Technical School", Classification: "Senior High Technical · public, co-ed", GenderPolicy: "Mixed", BoardingType: "Day & Boarding", Jurisdiction: "Cape Coast, Central Region", Summary: "A public technical senior high school offering technical, vocational and general programmes to the town's day and boarding students."},
	{ID: "university-practice-shs", Slug: "university-practice-shs", Kind: "school", Name: "University Practice Senior High School", Classification: "Senior High · public, co-ed", GenderPolicy: "Mixed", BoardingType: "Day & Boarding", Jurisdiction: "UCC Campus, Cape Coast", Summary: "The University of Cape Coast's practice senior high school on campus — a teaching school for the university's education students."},
	{ID: "efutu-senior-high-tech", Slug: "efutu-senior-high-tech", Kind: "school", Name: "Efutu Senior High Technical School", Classification: "Senior High Technical · public, co-ed", GenderPolicy: "Mixed", BoardingType: "Day", Jurisdiction: "Efutu, Cape Coast", Summary: "A public senior high technical school serving the Efutu area of Cape Coast."},
	{ID: "academy-of-christ-the-king", Slug: "academy-of-christ-the-king", Kind: "school", Name: "Academy of Christ the King", Classification: "Basic & Senior High · private (Catholic), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Pedu, Cape Coast", Summary: "A private Catholic school running basic and senior high programmes in Cape Coast."},
	{ID: "cape-coast-international-school", Slug: "cape-coast-international-school", Kind: "school", Name: "Cape Coast International School", Classification: "Basic & Senior High · private, co-ed", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "An independent, fee-paying international school offering basic and secondary education in Cape Coast."},

	// ── Basic schools (public / mission) ─────────────────────────────────────
	{ID: "kotokuraba-methodist-basic", Slug: "kotokuraba-methodist-basic", Kind: "school", Name: "Kotokuraba Methodist Basic School", Classification: "Basic school · Methodist (mission), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Kotokuraba, Cape Coast", Summary: "A mission basic school (KG–JHS) beside the Kotokuraba market at the heart of Cape Coast."},
	{ID: "aboom-methodist-basic", Slug: "aboom-methodist-basic", Kind: "school", Name: "Aboom Methodist Basic School", Classification: "Basic school · Methodist (mission), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Aboom, Cape Coast", Summary: "A Methodist basic school serving the Aboom quarter of Cape Coast."},
	{ID: "bakaano-anglican-basic", Slug: "bakaano-anglican-basic", Kind: "school", Name: "Bakaano Anglican Basic School", Classification: "Basic school · Anglican (mission), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Bakaano, Cape Coast", Summary: "An Anglican basic school in the Bakaano quarter near the shore."},
	{ID: "pedu-abura-ma-basic", Slug: "pedu-abura-ma-basic", Kind: "school", Name: "Pedu–Abura M/A Basic School", Classification: "Basic school · public, co-ed", GenderPolicy: "Mixed", Jurisdiction: "Pedu, Cape Coast", Summary: "A public (Metropolitan Assembly) basic school serving the Pedu and Abura neighbourhoods."},
	{ID: "amanful-catholic-basic", Slug: "amanful-catholic-basic", Kind: "school", Name: "Amanful Roman Catholic Basic School", Classification: "Basic school · Catholic (mission), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Amanful, Cape Coast", Summary: "A Catholic mission basic school in the Amanful quarter of Cape Coast."},
	{ID: "ola-presby-basic", Slug: "ola-presby-basic", Kind: "school", Name: "OLA Presbyterian Basic School", Classification: "Basic school · Presbyterian (mission), co-ed", GenderPolicy: "Mixed", Jurisdiction: "OLA Estate, Cape Coast", Summary: "A Presbyterian basic school on the OLA estate."},

	// ── Preparatory / private basic ──────────────────────────────────────────
	{ID: "ridge-experimental-school", Slug: "ridge-experimental-school", Kind: "school", Name: "Ridge Experimental School", Classification: "Basic school · quasi-public, co-ed", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "A well-known quasi-public basic school in Cape Coast."},
	{ID: "christ-the-king-prep-cc", Slug: "christ-the-king-prep-cc", Kind: "school", Name: "Christ the King Preparatory School", Classification: "Preparatory · private (Catholic), co-ed", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "A private Catholic preparatory (KG–JHS) school."},
	{ID: "ucc-basic-school", Slug: "ucc-basic-school", Kind: "school", Name: "University Primary & JHS (UCC)", Classification: "Basic school · quasi-public, co-ed", GenderPolicy: "Mixed", Jurisdiction: "UCC Campus, Cape Coast", Summary: "The University of Cape Coast's basic school on campus."},

	// ── Technical / vocational ───────────────────────────────────────────────
	{ID: "cape-coast-technical-institute", Slug: "cape-coast-technical-institute", Kind: "school", Name: "Cape Coast Technical Institute", Classification: "Technical/Vocational · public, co-ed", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "A public technical institute training craft and technician-level students in engineering, building and business trades."},
	{ID: "cape-coast-vocational-institute", Slug: "cape-coast-vocational-institute", Kind: "school", Name: "Cape Coast Vocational Training Institute (NVTI)", Classification: "Vocational · public, co-ed", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "An NVTI vocational institute teaching catering, dressmaking, cosmetology, electricals and other trades."},

	// ── Colleges of education / tertiary ─────────────────────────────────────
	{ID: "ola-college-of-education", Slug: "ola-college-of-education", Kind: "school", Name: "OLA College of Education", Classification: "College of Education · public, women", GenderPolicy: "Girls", BoardingType: "Boarding", Jurisdiction: "OLA Estate, Cape Coast", Summary: "A public women's college of education in Cape Coast training basic-school teachers."},
	{ID: "komenda-college-of-education", Slug: "komenda-college-of-education", Kind: "school", Name: "Komenda College of Education", Classification: "College of Education · public, co-ed", GenderPolicy: "Mixed", BoardingType: "Boarding", Jurisdiction: "Komenda (KEEA), Central Region", Summary: "A public college of education at Komenda, west of Cape Coast, training teachers for the region."},
	{ID: "cape-coast-technical-university", Slug: "cape-coast-technical-university", Kind: "school", Name: "Cape Coast Technical University", Classification: "Technical University · public", GenderPolicy: "Mixed", Jurisdiction: "Cape Coast, Central Region", Summary: "A public technical university offering higher national diploma and degree programmes in technical and applied fields."},
	{ID: "nmtc-cape-coast", Slug: "nmtc-cape-coast", Kind: "school", Name: "Nursing & Midwifery Training College, Cape Coast", Classification: "Nurses' Training · public", GenderPolicy: "Mixed", BoardingType: "Boarding", Jurisdiction: "Cape Coast, Central Region · Ministry of Health", Summary: "A public health-training college preparing registered nurses and midwives for the Central Region."},

	// ── Heritage places (claimable by the responsible office) ────────────────
	{ID: "fort-william-lighthouse", Slug: "fort-william-lighthouse", Kind: "heritage", Name: "Fort William (Cape Coast Lighthouse)", Classification: "Colonial fort & lighthouse", Jurisdiction: "Dawson's Hill, Cape Coast", Summary: "A British fort on the hill above the town, later crowned with the Cape Coast lighthouse that still guides ships along the coast."},
	{ID: "fort-victoria-cape-coast", Slug: "fort-victoria-cape-coast", Kind: "heritage", Name: "Fort Victoria", Classification: "Colonial watch-tower fort", Jurisdiction: "Cape Coast, Central Region", Summary: "A small hilltop fort built to watch over Cape Coast Castle and the approaches to the town."},
	{ID: "fosu-lagoon", Slug: "fosu-lagoon", Kind: "heritage", Name: "Fosu Lagoon", Classification: "Lagoon & wetland", Jurisdiction: "Cape Coast, Central Region", Summary: "The lagoon on the eastern edge of Cape Coast — a fishing and ecological site woven into the town's Fetu Afahye rites."},
	{ID: "victoria-park-cape-coast", Slug: "victoria-park-cape-coast", Kind: "heritage", Name: "Victoria Park", Classification: "Public park & durbar ground", Jurisdiction: "Cape Coast, Central Region", Summary: "The town's central park and parade ground, host to durbars, independence marches and public gatherings."},
	{ID: "centre-for-national-culture-cc", Slug: "centre-for-national-culture-cc", Kind: "heritage", Name: "Cape Coast Centre for National Culture", Classification: "Arts & culture centre", Jurisdiction: "Cape Coast, Central Region", Summary: "The regional centre for arts and culture — crafts, performance and the home of much of the town's festival organising."},
	{ID: "emintsimadze-palace", Slug: "emintsimadze-palace", Kind: "heritage", Name: "Emintsimadze Palace", Classification: "Traditional palace", Jurisdiction: "Oguaa Traditional Area, Cape Coast", Summary: "The palace of the Oguaamanhen — seat of the Oguaa Traditional Council and the focus of the town's chieftaincy."},
	{ID: "chapel-square-cape-coast", Slug: "chapel-square-cape-coast", Kind: "heritage", Name: "Chapel Square", Classification: "Historic square", Jurisdiction: "Chapel Square, Cape Coast", Summary: "The historic square by the Wesley Methodist cathedral, long a gathering point in the old town."},
	{ID: "jubilee-park-cape-coast", Slug: "jubilee-park-cape-coast", Kind: "heritage", Name: "Jubilee Park", Classification: "Public park", Jurisdiction: "Cape Coast, Central Region", Summary: "A public park and event ground in Cape Coast."},
	{ID: "robert-mensah-stadium", Slug: "robert-mensah-stadium", Kind: "heritage", Name: "Robert Mensah Stadium", Classification: "Sports stadium", Jurisdiction: "Cape Coast, Central Region", Summary: "Cape Coast's football stadium, named for the legendary goalkeeper Robert Mensah — home of the town's sporting life."},
	{ID: "assin-manso-slave-river", Slug: "assin-manso-slave-river", Kind: "heritage", Name: "Assin Manso Slave River Site (Nnonkonsuo)", Classification: "Memorial & heritage site", Jurisdiction: "Assin Manso, Central Region · ~40 km from Cape Coast", Summary: "The 'Last Bath' river where enslaved people were washed before the coast — now a memorial and a site of return for the diaspora."},
}

// seedClaimableOrgsData inserts every claimable org whose slug is not already
// present (used by the full Seed and the top-up command). Returns how many were
// newly inserted.
func seedClaimableOrgsData(ctx context.Context, db *mongo.Database) (int, error) {
	coll := db.Collection(collOrgs)
	inserted := 0
	for _, o := range seedClaimableOrgs {
		n, err := coll.CountDocuments(ctx, bson.M{"slug": o.Slug})
		if err != nil {
			return inserted, err
		}
		if n > 0 {
			continue // never touch an existing org
		}
		if _, err := coll.InsertOne(ctx, o); err != nil {
			return inserted, err
		}
		inserted++
	}
	return inserted, nil
}

// SeedClaimableOrgsOnly tops up the orgs collection with the claimable schools +
// places, skipping any slug that already exists. Non-destructive and idempotent.
func SeedClaimableOrgsOnly(ctx context.Context, db *mongo.Database) (int, error) {
	return seedClaimableOrgsData(ctx, db)
}
