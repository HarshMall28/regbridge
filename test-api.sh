# 1. Health
curl -s http://localhost:3000/health

# 2. Palette search — substance
curl -s "http://localhost:3000/api/search?q=prothi&limit=5"

# 3. Palette search — CAS
curl -s "http://localhost:3000/api/search?q=178928-70-6"

# 4. Substance profile
curl -s http://localhost:3000/api/substances/Prothioconazole

# 5. Product search
curl -s "http://localhost:3000/api/products?substance=Glyphosate&country=ie&limit=5"

# 6. Product detail IE
curl -s http://localhost:3000/api/products/ie/07167

# 7. Product detail FR
curl -s http://localhost:3000/api/products/fr/2100108

# 8. MRL check
curl -s "http://localhost:3000/api/mrls/check?substance=Glyphosate&commodity=Apples"

# 9. MRL check with compliance
curl -s "http://localhost:3000/api/mrls/check?substance=Glyphosate&commodity=Apples&value=0.05"

# 10. List tables
curl -s http://localhost:3000/api/tables

# 11. Table schema
curl -s http://localhost:3000/api/tables/eu_active_substances/schema

# 12. Explore table with filters
curl -s -G http://localhost:3000/api/tables/eu_active_substances \
  --data-urlencode 'filters={"status":"Approved","expiry_dt__lt":"2027-01-01"}' \
  -d 'limit=3'

# 13. 404 test
curl -s http://localhost:3000/api/substances/Unobtanium

# Substance profile — was failing on expiry_dt
curl -s http://localhost:3000/api/substances/Prothioconazole | jq .identity

# MRL check — was failing on mrl.value  
curl -s "http://localhost:3000/api/mrls/check?substance=Glyphosate&commodity=Apples" | jq .commodity_results