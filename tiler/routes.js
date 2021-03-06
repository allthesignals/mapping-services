import Router from 'koa-router';
const router = new Router();
import SphericalMercator from '@mapbox/sphericalmercator';

const mercator = new SphericalMercator({size: 256});

// assumes a standard "geom" column being the geometry
const performQueryWithGeojson = async (db,query,options={}) => {
  const { identifier = 'id' } = options;
  const { geometry = 'geom' } = options;

  // const queryProperties = await db.any(`
  //   SELECT
  //     *
  //   FROM (
  //     ${query}
  //   ) q
  //   LIMIT 1
  // `)

  return db.one(`
    SELECT jsonb_build_object(
        'type',     'FeatureCollection',
        'features', jsonb_agg(features.feature)
    )
    FROM (
      SELECT jsonb_build_object(
        'type',       'Feature',
        'id',         ${identifier},
        'geometry',   ST_AsGeoJSON(${geometry})::jsonb,
        'properties', to_jsonb(inputs) - '${identifier}' - '${geometry}'
      ) AS feature
      FROM (${query}) inputs
    ) features;
  `)
}

router.get('/',
  async ctx => {
    ctx.body = {key: 'Hey! I make tiles!'};
  },
);

router.get('/query:format?',
  async ctx=>{
    const {req,res,params,query,app} = ctx
    const {db} = app
    const {q}  = query
    const {format = ''} = params

    switch(format.replace('.','')) {
      case 'geojson': {
        ctx.body = await performQueryWithGeojson(db,q)
        break
      }
      default: ctx.body = await db.any(q)
    }
  }
)
router.get('/tiles/:z/:x/:y.mvt',
  async ctx=>{
    const {params,query,app} = ctx
    const {db} = app
    const {q}  = query
    const {x,y,z} = params
    const layer_name = 'layer'
    const bbox = mercator.bbox(x,y,z,false)

    const tile_query= `
        SELECT ST_AsMVT(q, '${layer_name}', 4096, 'mvt_geom')
    FROM (
      SELECT
          *,
          ST_AsMVTGeom(
              geom,
              ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${
    bbox[3]
  }, 4326),
              4096,
              256,
              true
          ) mvt_geom
      FROM (
        ${q}
      ) c
    ) q
   `;

    const result = await db.any(tile_query)
    ctx.body = result[0].st_asmvt
  }
)

export default router;
